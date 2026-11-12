import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card">
      <h1>הדף לא נמצא</h1>
      <Link href="/">חזרה לדף הבית</Link>
    </div>
  );
}
