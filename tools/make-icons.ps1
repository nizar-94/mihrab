# Builds build/icon.ico from the logo assets in build/logo/.
#
# icon.ico is what Windows shows for the installer, the .exe, the Start Menu
# shortcut and the Add/Remove Programs entry. It is a multi-resolution
# container, and Windows picks a frame by context: 16px in Explorer's
# details view, 32px on the desktop and in the taskbar, 48px in alt-tab,
# 256px in the installer header and large-icon views.
#
# Two source artworks, on purpose - the design set provides both:
#
#   taskbar-icon (no dome ribs)  -> 16, 24, 32
#   app-icon     (full detail)   -> 48, 64, 128, 256
#
# The ribs and dome shading in app-icon.svg turn to mud below ~48px.
# Substituting the simplified mark at small sizes is the whole reason a
# separate taskbar-icon exists, and is standard practice for icon sets.
#
# Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
#
# The tray icons are NOT generated here. They ship as the designer's own
# PNG exports in resources/icons/ (tray-light-* and tray-dark-*, at 16/24/32)
# because the tray needs a transparent background and a light/dark pair -
# see src/main/tray.js, which picks between them based on the system theme.

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$logoDir = Join-Path $root 'build\logo'
$icoPath = Join-Path $root 'build\icon.ico'

# An array of entries rather than [ordered]@{}: PowerShell indexes an
# OrderedDictionary POSITIONALLY when handed an integer, so $plan[32] returns
# the third value instead of the entry for size 32, and the lookup silently
# evaluates to null.
$plan = @(
  @{ Size = 16;  File = 'taskbar-icon-48.png' }
  @{ Size = 24;  File = 'taskbar-icon-48.png' }
  @{ Size = 32;  File = 'taskbar-icon-48.png' }
  @{ Size = 48;  File = 'app-icon-256.png' }
  @{ Size = 64;  File = 'app-icon-256.png' }
  @{ Size = 128; File = 'app-icon-256.png' }
  @{ Size = 256; File = 'app-icon-256.png' }
)

$sources = @{}
foreach ($file in ($plan.File | Select-Object -Unique)) {
  $path = Join-Path $logoDir $file
  if (-not (Test-Path $path)) { throw "missing source asset: $path" }
  $sources[$file] = [System.Drawing.Image]::FromFile($path)
  Write-Host "source $file : $($sources[$file].Width)x$($sources[$file].Height)"
}

function Get-Frame {
  param([System.Drawing.Image]$Image, [int]$Size)
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($Image, (New-Object System.Drawing.Rectangle 0, 0, $Size, $Size))
  $g.Dispose()
  $s = New-Object System.IO.MemoryStream
  $bmp.Save($s, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  # Comma operator: without it PowerShell unrolls the byte[] into the
  # pipeline and the caller receives an Object[] of bytes, which
  # BinaryWriter then writes as a single byte - silently producing a
  # 125-byte .ico whose directory entries all point past end of file.
  return ,$s.ToArray()
}

$frames = @()
foreach ($entry in $plan) {
  $frames += [pscustomobject]@{
    Size = $entry.Size
    Png  = (Get-Frame -Image $sources[$entry.File] -Size $entry.Size)
  }
}

$out = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $out
# ICONDIR: reserved(0), type(1 = icon), image count
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$frames.Count)
$offset = 6 + (16 * $frames.Count)
foreach ($f in $frames) {
  # ICONDIRENTRY. Width and height are single bytes, so 256 is encoded as 0.
  $dim = if ($f.Size -eq 256) { 0 } else { $f.Size }
  $w.Write([Byte]$dim); $w.Write([Byte]$dim)
  $w.Write([Byte]0); $w.Write([Byte]0)        # palette entries, reserved
  $w.Write([UInt16]1); $w.Write([UInt16]32)   # colour planes, bits per pixel
  $w.Write([UInt32]$f.Png.Length)
  $w.Write([UInt32]$offset)
  $offset += $f.Png.Length
}
foreach ($f in $frames) { $w.Write([byte[]]$f.Png) }
$w.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $out.ToArray())

foreach ($img in $sources.Values) { $img.Dispose() }
$out.Dispose()

$written = [System.IO.File]::ReadAllBytes($icoPath)
Write-Host "wrote build/icon.ico - $($frames.Count) frames, $($written.Length) bytes"
