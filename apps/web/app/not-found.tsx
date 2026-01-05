import Link from "next/link";

// app/not-found.tsx
export default function NotFound() {
  return (
    <div>
      <h1>Page not found</h1>
      <Link href="/">Go back to home</Link>
    </div>
  );
}
