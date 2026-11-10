export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function formatRelative(value) {
  if (!value) return 'never';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return 'never';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export function truncate(text, length = 28) {
  if (!text) return '';
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
