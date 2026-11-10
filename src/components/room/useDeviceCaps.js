import { useState } from 'react';

const readCaps = () => {
  if (typeof navigator === 'undefined') {
    return { isMobile: false, canShareScreen: false };
  }
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const hasCapture = typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  return { isMobile, canShareScreen: hasCapture && !isMobile };
};

export default function useDeviceCaps() {
  const [caps] = useState(readCaps);
  return caps;
}