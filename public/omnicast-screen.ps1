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
# 4K by default: the page asks for the screen's own width when it wants less, and a
# desktop sent at its real size is what keeps small text readable on a phone.
$defaultWidth = 3840
$defaultQuality = 80

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
# A locked or signed-out Windows desktop is handed over as one black rectangle. No
# input reaches the sign-in screen either, so that frame is flagged as BLANK as it
# goes out (see below) and the app says the computer is locked. It is still sent,
# because a viewer with no picture at all cannot tell a locked desktop from a
# broken connection.
$probe = @(
  @(0.12, 0.10), @(0.50, 0.10), @(0.86, 0.10),
  @(0.12, 0.50), @(0.50, 0.50), @(0.86, 0.50),
  @(0.12, 0.90), @(0.50, 0.90), @(0.86, 0.90),
  @(0.03, 0.98), @(0.97, 0.98), @(0.50, 0.98)
)
$frames = 0

function Test-BlackDesktop($bmp) {
  foreach ($p in $probe) {
    $x = [int][Math]::Min([Math]::Max([Math]::Round($bmp.Width * $p[0]), 0), $bmp.Width - 1)
    $y = [int][Math]::Min([Math]::Max([Math]::Round($bmp.Height * $p[1]), 0), $bmp.Height - 1)
    $c = $bmp.GetPixel($x, $y)
    # Only a pixel-perfect black rectangle counts. A locked Windows session hands
    # over exactly zeroes, while a dark-but-real desktop almost never does at all
    # twelve spread-out points — so a dark picture is not mistaken for a lock.
    if ($c.R -gt 0 -or $c.G -gt 0 -or $c.B -gt 0) { return $false }
  }
  return $true
}
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

      # Opaque bitmaps drawn the ordinary way. CompositingMode.SourceCopy copies the
      # alpha byte as well, and a grabbed bitmap has none — which is how a whole
      # screen used to be handed over as one blank rectangle.
      $rgb = [System.Drawing.Imaging.PixelFormat]::Format32bppRgb
      $full = New-Object System.Drawing.Bitmap -ArgumentList @($area.Width, $area.Height, $rgb)
      $gFull = [System.Drawing.Graphics]::FromImage($full)

      if ($outW -ne $area.Width -or $outH -ne $area.Height) {
        $scaled = New-Object System.Drawing.Bitmap -ArgumentList @($outW, $outH, $rgb)
        $gScaled = [System.Drawing.Graphics]::FromImage($scaled)
        # Fast and still sharp when the screen is only being shrunk a little; a
        # bicubic pass over a 4K desktop costs more time than a whole extra frame.
        $gScaled.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::Bilinear
        $gScaled.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
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

    # Checked every fifth grab only: a locked desktop stays locked far longer than
    # that, and reading pixels costs more than the grab itself.
    $frames++
    $blank = $false
    if (($frames % 5) -eq 0) { $blank = Test-BlackDesktop $full }

    if ($gScaled) { $gScaled.DrawImage($full, 0, 0, $outW, $outH) }

    if (-not $buffer) { $buffer = New-Object System.IO.MemoryStream }
    $buffer.SetLength(0)
    if ($gScaled) { $scaled.Save($buffer, $codec, $params) } else { $full.Save($buffer, $codec, $params) }

    $payload = [Convert]::ToBase64String($buffer.ToArray())
    # The picture always goes out, with the word in front of it when the desktop looks
    # locked. Skipping the frame instead is what made a shared screen arrive blank:
    # the viewer was left with nothing at all instead of the black desktop itself.
    if ($blank) {
      [Console]::Out.WriteLine("BLANK $payload")
    } else {
      [Console]::Out.WriteLine($payload)
    }
    [Console]::Out.Flush()
  } catch {
    $shape = ''
    [Console]::Out.WriteLine('ERR')
    [Console]::Out.Flush()
  }
}
