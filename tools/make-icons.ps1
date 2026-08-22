# Regenerates the app icon set from build/icon.ico.
#
# Why this exists: the original icon.ico was rendered with ClearType
# (subpixel) antialiasing and then upscaled, which baked per-channel RGB
# fringing into the edges of the M. Harmless at 16-32px, clearly visible at
# 128-256px in the installer header and Start Menu, where the white strokes
# pick up blue and yellow edges.
#
# The fix does NOT redraw the artwork — the letterform is left exactly as
# designed. The icon is a two-colour design (white M on a green disc), so
# every colour in it should sit somewhere on the straight line between those
# two colours. Anything off that line is subpixel fringing by definition.
# Each pixel is therefore projected back onto the green->white line, using
# its luminance to decide how far along it sits. Alpha is untouched, so the
# antialiased circle edge survives intact.
#
# Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
#
# Writes:
#   build/icon.ico            (16,24,32,48,64,128,256 - installer + .exe)
#   resources/icons/app.png   (256 - taskbar/window icon, see windows.js)
#   resources/icons/tray.png  (32  - notification area, see tray.js)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$icoPath = Join-Path $root 'build\icon.ico'

# --- Read the largest frame out of the existing .ico -----------------------
# .NET's Icon class cannot decode PNG-compressed frames, which every frame in
# this file is, so the container is parsed by hand: 6-byte ICONDIR, then one
# 16-byte ICONDIRENTRY per image, each pointing at a PNG blob.
$bytes = [System.IO.File]::ReadAllBytes($icoPath)
$count = [BitConverter]::ToUInt16($bytes, 4)
$best = $null
for ($n = 0; $n -lt $count; $n++) {
  $off = 6 + ($n * 16)
  $w = $bytes[$off]; if ($w -eq 0) { $w = 256 }
  $len = [BitConverter]::ToUInt32($bytes, $off + 8)
  $dataOff = [BitConverter]::ToUInt32($bytes, $off + 12)
  if ($null -eq $best -or $w -gt $best.W) {
    $best = [pscustomobject]@{ W = $w; Offset = $dataOff; Length = $len }
  }
}
$ms = New-Object System.IO.MemoryStream (,$bytes[$best.Offset..($best.Offset + $best.Length - 1)])
$src = [System.Drawing.Image]::FromStream($ms)
Write-Host "source frame: $($src.Width)x$($src.Height)"

# --- Sample the two design colours ----------------------------------------
# Both are taken as the MODE of the opaque pixels — the two most common
# colours in a two-colour design are, by construction, those two colours.
#
# An earlier version of this script picked the green as "the most saturated
# opaque pixel" and got #79D3FF — a light blue. That is exactly the bug
# being fixed here: the most saturated pixel in the image is a ClearType
# fringe pixel, not the disc. Frequency is immune to that, because fringing
# only ever occupies a thin outline while the disc and the letter occupy
# large solid areas.
$histogram = @{}
for ($y = 0; $y -lt $src.Height; $y++) {
  for ($x = 0; $x -lt $src.Width; $x++) {
    $p = $src.GetPixel($x, $y)
    if ($p.A -lt 250) { continue }
    # [int] casts are load-bearing: PowerShell 5.1 evaluates a Byte shift
    # within Byte width, so `$p.R -shl 16` silently yields 0.
    $key = ([int]$p.R -shl 16) -bor ([int]$p.G -shl 8) -bor [int]$p.B
    $histogram[$key] = 1 + $histogram[$key]
  }
}
$top = $histogram.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 2
$colours = $top | ForEach-Object {
  [System.Drawing.Color]::FromArgb(255, ($_.Key -shr 16) -band 0xFF, ($_.Key -shr 8) -band 0xFF, $_.Key -band 0xFF)
}
# Of the two dominant colours, the brighter one is the letter, the other the disc.
$lum0 = (0.2126 * $colours[0].R) + (0.7152 * $colours[0].G) + (0.0722 * $colours[0].B)
$lum1 = (0.2126 * $colours[1].R) + (0.7152 * $colours[1].G) + (0.0722 * $colours[1].B)
if ($lum0 -gt $lum1) { $white = $colours[0]; $green = $colours[1] }
else                 { $white = $colours[1]; $green = $colours[0] }
Write-Host ("green : #{0:X2}{1:X2}{2:X2}" -f $green.R, $green.G, $green.B)
Write-Host ("white : #{0:X2}{1:X2}{2:X2}" -f $white.R, $white.G, $white.B)

$lumOf = { param($c) (0.2126 * $c.R) + (0.7152 * $c.G) + (0.0722 * $c.B) }
$lumGreen = & $lumOf $green
$lumWhite = & $lumOf $white

# --- Project every pixel onto the green->white line -----------------------
$clean = New-Object System.Drawing.Bitmap $src.Width, $src.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $src.Height; $y++) {
  for ($x = 0; $x -lt $src.Width; $x++) {
    $p = $src.GetPixel($x, $y)
    if ($p.A -eq 0) { $clean.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0)); continue }
    $lum = & $lumOf $p
    $t = ($lum - $lumGreen) / ($lumWhite - $lumGreen)
    if ($t -lt 0) { $t = 0 }; if ($t -gt 1) { $t = 1 }
    $r = [int][Math]::Round($green.R + $t * ($white.R - $green.R))
    $g = [int][Math]::Round($green.G + $t * ($white.G - $green.G))
    $b = [int][Math]::Round($green.B + $t * ($white.B - $green.B))
    $clean.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($p.A, $r, $g, $b))
  }
}

function Resize-Icon {
  param([System.Drawing.Bitmap]$Bitmap, [int]$Size)
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($Bitmap, (New-Object System.Drawing.Rectangle 0, 0, $Size, $Size))
  $g.Dispose()
  return $bmp
}

function Get-PngBytes {
  param([System.Drawing.Bitmap]$Bitmap)
  $s = New-Object System.IO.MemoryStream
  $Bitmap.Save($s, [System.Drawing.Imaging.ImageFormat]::Png)
  # Comma operator: without it PowerShell unrolls the byte[] into the
  # pipeline and the caller gets an Object[] of bytes, which BinaryWriter
  # silently writes as a single byte. That produced a 125-byte .ico whose
  # directory entries all pointed past the end of the file.
  return ,$s.ToArray()
}

# --- Write the .ico -------------------------------------------------------
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$frames = @()
foreach ($size in $sizes) {
  $bmp = Resize-Icon -Bitmap $clean -Size $size
  $frames += [pscustomobject]@{ Size = $size; Png = (Get-PngBytes -Bitmap $bmp) }
  if ($size -eq 256) { $bmp.Save((Join-Path $root 'resources\icons\app.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
  if ($size -eq 32)  { $bmp.Save((Join-Path $root 'resources\icons\tray.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
  $bmp.Dispose()
}

$out = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $out
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$frames.Count)  # ICONDIR: reserved, type=icon, count
$offset = 6 + (16 * $frames.Count)
foreach ($f in $frames) {
  # A 256px frame is encoded as 0 in the single width/height bytes.
  $dim = if ($f.Size -eq 256) { 0 } else { $f.Size }
  $w.Write([Byte]$dim); $w.Write([Byte]$dim)
  $w.Write([Byte]0); $w.Write([Byte]0)          # palette count, reserved
  $w.Write([UInt16]1); $w.Write([UInt16]32)     # colour planes, bits per pixel
  $w.Write([UInt32]$f.Png.Length)
  $w.Write([UInt32]$offset)
  $offset += $f.Png.Length
}
foreach ($f in $frames) { $w.Write([byte[]]$f.Png) }
$w.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $out.ToArray())

$src.Dispose(); $clean.Dispose(); $ms.Dispose(); $out.Dispose()
Write-Host "wrote build/icon.ico, resources/icons/app.png, resources/icons/tray.png"
