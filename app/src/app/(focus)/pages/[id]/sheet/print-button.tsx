"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn btn-secondary !min-h-11 !px-4 text-[15px]" onClick={() => window.print()}>
      Печат
    </button>
  );
}
