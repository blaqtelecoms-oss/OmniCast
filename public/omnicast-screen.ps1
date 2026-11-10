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

$target = 1280
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]50)

while ($null -ne ($line = [Console]::In.ReadLine())) {
  if ($line.Trim() -ne 'grab') { continue }
  try {
    $area = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $full = New-Object System.Drawing.Bitmap($area.Width, $area.Height)
    $g = [System.Drawing.Graphics]::FromImage($full)
    $g.CopyFromScreen($area.X, $area.Y, 0, 0, $full.Size)
    $g.Dispose()

    $w = $full.Width
    $h = $full.Height
    if ($w -gt $target) {
      $h = [int]([Math]::Round($h * $target / $w))
      $w = $target
    }

    $scaled = New-Object System.Drawing.Bitmap($w, $h)
    $g2 = [System.Drawing.Graphics]::FromImage($scaled)
    $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::Bilinear
    $g2.DrawImage($full, 0, 0, $w, $h)
    $g2.Dispose()
    $full.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $scaled.Save($ms, $codec, $params)
    $scaled.Dispose()

    [Console]::Out.WriteLine([Convert]::ToBase64String($ms.ToArray()))
    [Console]::Out.Flush()
    $ms.Dispose()
  } catch {
    [Console]::Out.WriteLine('ERR')
    [Console]::Out.Flush()
  }
}
