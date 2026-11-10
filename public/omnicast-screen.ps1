$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OmniScreen {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
[void][OmniScreen]::SetProcessDPIAware()

# One line per frame: "grab [width] [quality]". Everything below — the screen
# bitmap, the scaled copy, the encoder settings and the output buffer — is built
# once and reused, because allocating a full-screen bitmap per frame is what made
# this helper slow, and slow capture looks exactly like a laggy remote control.
$defaultWidth = 1600
$defaultQuality = 72

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$full = $null
$scaled = $null
$gFull = $null
$gScaled = $null
$buffer = $null
$params = $null
$shape = ''
$quality = 0

while ($null -ne ($line = [Console]::In.ReadLine())) {
  $parts = $line.Trim().Split(' ')
  if ($parts.Length -eq 0 -or $parts[0] -ne 'grab') { continue }

  $wantWidth = 0
  $wantQuality = 0
  if ($parts.Length -gt 1) { [void][int]::TryParse($parts[1], [ref]$wantWidth) }
  if ($parts.Length -gt 2) { [void][int]::TryParse($parts[2], [ref]$wantQuality) }
  if ($wantWidth -le 0) { $wantWidth = $defaultWidth }
  if ($wantQuality -le 0) { $wantQuality = $defaultQuality }
  if ($wantQuality -gt 95) { $wantQuality = 95 }

  try {
    $area = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $scale = [double]$wantWidth / [double]$area.Width
    if ($scale -gt 1) { $scale = 1 }
    $outW = [int][Math]::Max(2.0, [Math]::Round([double]$area.Width * $scale))
    $outH = [int][Math]::Max(2.0, [Math]::Round([double]$area.Height * $scale))
    $nextShape = "$($area.Width)x$($area.Height)x$outW" + "x$outH"

    if ($nextShape -ne $shape) {
      if ($gScaled) { $gScaled.Dispose() }
      if ($scaled) { $scaled.Dispose() }
      if ($gFull) { $gFull.Dispose() }
      if ($full) { $full.Dispose() }

      $rgb = [System.Drawing.Imaging.PixelFormat]::Format32bppRgb
      $full = New-Object System.Drawing.Bitmap -ArgumentList @($area.Width, $area.Height, $rgb)
      $gFull = [System.Drawing.Graphics]::FromImage($full)
      $gFull.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy

      if ($outW -ne $area.Width -or $outH -ne $area.Height) {
        $scaled = New-Object System.Drawing.Bitmap -ArgumentList @($outW, $outH, $rgb)
        $gScaled = [System.Drawing.Graphics]::FromImage($scaled)
        # Fast and still sharp when the screen is only being shrunk a little; a
        # bicubic pass over a 4K desktop costs more time than a whole extra frame.
        $gScaled.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::Bilinear
        $gScaled.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $gScaled.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      } else {
        $scaled = $null
        $gScaled = $null
      }
      $shape = $nextShape
    }

    if ($wantQuality -ne $quality) {
      if ($params) { $params.Dispose() }
      $params = New-Object System.Drawing.Imaging.EncoderParameters -ArgumentList 1
      $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter -ArgumentList @([System.Drawing.Imaging.Encoder]::Quality, [long]$wantQuality)
      $quality = $wantQuality
    }

    $gFull.CopyFromScreen($area.X, $area.Y, 0, 0, $full.Size)

    if ($gScaled) { $gScaled.DrawImage($full, 0, 0, $outW, $outH) }

    if (-not $buffer) { $buffer = New-Object System.IO.MemoryStream }
    $buffer.SetLength(0)
    if ($gScaled) { $scaled.Save($buffer, $codec, $params) } else { $full.Save($buffer, $codec, $params) }

    [Console]::Out.WriteLine([Convert]::ToBase64String($buffer.ToArray()))
    [Console]::Out.Flush()
  } catch {
    $shape = ''
    [Console]::Out.WriteLine('ERR')
    [Console]::Out.Flush()
  }
}
