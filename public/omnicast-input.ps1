$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OmniIn {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [StructLayout(LayoutKind.Sequential)] public struct P { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out P p);
  public static int X() { P p; GetCursorPos(out p); return p.X; }
  public static int Y() { P p; GetCursorPos(out p); return p.Y; }
  public const uint LDOWN = 2;
  public const uint LUP = 4;
  public const uint RDOWN = 8;
  public const uint RUP = 16;
  public const uint MDOWN = 32;
  public const uint MUP = 64;
  public const uint WHEEL = 2048;
  public static int W() { return GetSystemMetrics(0); }
  public static int H() { return GetSystemMetrics(1); }
}
'@
# The picture the phone sees is the whole desktop, which on more than one monitor
# starts to the left of (or above) the primary screen. Positions are mapped over
# that same area, otherwise a click on the second monitor lands on the first.
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
$vx = $vs.X
$vy = $vs.Y
$vw = $vs.Width
$vh = $vs.Height
[Console]::Out.WriteLine('OmniIn-ready')
[Console]::Out.Flush()
$map = @{ 'Enter' = 13; 'Backspace' = 8; 'Tab' = 9; 'Escape' = 27; 'Delete' = 46; 'ArrowUp' = 38; 'ArrowDown' = 40; 'ArrowLeft' = 37; 'ArrowRight' = 39; 'Home' = 36; 'End' = 35; 'PageUp' = 33; 'PageDown' = 34; ' ' = 32 }
while ($null -ne ($line = [Console]::In.ReadLine())) {
  if ($line.Trim().Length -eq 0) { continue }
  try { $cmd = $line | ConvertFrom-Json } catch { continue }
  $x = 0
  $y = 0
  if ($null -ne $cmd.x) { $x = [Math]::Min([Math]::Max([int][Math]::Round($vx + [double]$cmd.x * ($vw - 1)), $vx), $vx + $vw - 1) }
  if ($null -ne $cmd.y) { $y = [Math]::Min([Math]::Max([int][Math]::Round($vy + [double]$cmd.y * ($vh - 1)), $vy), $vy + $vh - 1) }
  switch ($cmd.kind) {
    'probe' {
      $px = [int]($vx + $vw / 2)
      $py = [int]($vy + $vh / 2)
      [void][OmniIn]::SetCursorPos($px, $py)
      Start-Sleep -Milliseconds 80
      $cx = [OmniIn]::X()
      $cy = [OmniIn]::Y()
      if (([Math]::Abs($cx - $px) -le 2) -and ([Math]::Abs($cy - $py) -le 2)) {
        [Console]::Out.WriteLine('OmniIn-test ok')
      } else {
        [Console]::Out.WriteLine("OmniIn-test blocked $cx $cy")
      }
      [Console]::Out.Flush()
    }
    'move' { [void][OmniIn]::SetCursorPos($x, $y) }
    'click' {
      [void][OmniIn]::SetCursorPos($x, $y)
      if ($cmd.payload -eq 'right') {
        [OmniIn]::mouse_event([OmniIn]::RDOWN, 0, 0, 0, [UIntPtr]::Zero)
        [OmniIn]::mouse_event([OmniIn]::RUP, 0, 0, 0, [UIntPtr]::Zero)
      } else {
        [OmniIn]::mouse_event([OmniIn]::LDOWN, 0, 0, 0, [UIntPtr]::Zero)
        [OmniIn]::mouse_event([OmniIn]::LUP, 0, 0, 0, [UIntPtr]::Zero)
      }
    }
    # A drag is a press held across many moves, so the button goes down once and is
    # released at the other end. Without this a phone could click but never select
    # text, pull a scrollbar or drag a window.
    'down' {
      [void][OmniIn]::SetCursorPos($x, $y)
      if ($cmd.payload -eq 'right') {
        [OmniIn]::mouse_event([OmniIn]::RDOWN, 0, 0, 0, [UIntPtr]::Zero)
      } elseif ($cmd.payload -eq 'middle') {
        [OmniIn]::mouse_event([OmniIn]::MDOWN, 0, 0, 0, [UIntPtr]::Zero)
      } else {
        [OmniIn]::mouse_event([OmniIn]::LDOWN, 0, 0, 0, [UIntPtr]::Zero)
      }
    }
    'up' {
      if ($null -ne $cmd.x -and $null -ne $cmd.y) { [void][OmniIn]::SetCursorPos($x, $y) }
      if ($cmd.payload -eq 'right') {
        [OmniIn]::mouse_event([OmniIn]::RUP, 0, 0, 0, [UIntPtr]::Zero)
      } elseif ($cmd.payload -eq 'middle') {
        [OmniIn]::mouse_event([OmniIn]::MUP, 0, 0, 0, [UIntPtr]::Zero)
      } else {
        [OmniIn]::mouse_event([OmniIn]::LUP, 0, 0, 0, [UIntPtr]::Zero)
      }
    }
    'double' {
      [void][OmniIn]::SetCursorPos($x, $y)
      for ($i = 0; $i -lt 2; $i++) {
        [OmniIn]::mouse_event([OmniIn]::LDOWN, 0, 0, 0, [UIntPtr]::Zero)
        [OmniIn]::mouse_event([OmniIn]::LUP, 0, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 30
      }
    }
    # A phone keyboard inserts whole words rather than single presses, so text is
    # typed in one pass here instead of being replayed character by character.
    'text' {
      $text = [string]$cmd.payload
      if ($text.Length -gt 0) {
        $escaped = $text -replace '([+^%~()\[\]{}])', '{$1}'
        [System.Windows.Forms.SendKeys]::SendWait($escaped)
      }
    }
    'scroll' {
      $steps = 0
      if ($cmd.payload) { $steps = [int]$cmd.payload }
      if ($steps -ne 0) { [OmniIn]::mouse_event([OmniIn]::WHEEL, 0, 0, (-120 * $steps), [UIntPtr]::Zero) }
    }
    'key' {
      if (-not $cmd.payload) { continue }
      $k = $cmd.payload | ConvertFrom-Json
      $name = [string]$k.k
      $mods = @()
      if ($k.c) { $mods += 17 }
      if ($k.s) { $mods += 16 }
      if ($k.a) { $mods += 18 }
      $vk = 0
      if ($map.ContainsKey($name)) { $vk = $map[$name] }
      elseif ($name.Length -eq 1) {
        if ($name -cmatch '^[a-zA-Z]$') { $vk = [int][char]([string]$name).ToUpper() }
        elseif ($name -match '^[0-9]$') { $vk = 48 + [int]$name }
      }
      if ($vk -eq 0) {
        if ($name.Length -eq 1 -and -not $k.c -and -not $k.a) {
          $esc = $name -replace '([+^%~(){}\[\]])', '{$1}'
          [System.Windows.Forms.SendKeys]::SendWait($esc)
        }
      } else {
        foreach ($m in $mods) { [OmniIn]::keybd_event([byte]$m, 0, 0, [UIntPtr]::Zero) }
        [OmniIn]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero)
        [OmniIn]::keybd_event([byte]$vk, 0, 2, [UIntPtr]::Zero)
        foreach ($m in $mods) { [OmniIn]::keybd_event([byte]$m, 0, 2, [UIntPtr]::Zero) }
      }
    }
  }
}
