interface AlertMessagesProps {
  error: string | null;
  accessMessage: string | null;
}

export default function AlertMessages({ error, accessMessage }: AlertMessagesProps) {
  return (
    <>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          {error}
        </div>
      )}

      {accessMessage && (
        <div className="rounded-xl border border-[#cfe1d6] bg-[#f2f8f4] px-4 py-3 font-sans text-sm text-primary">
          {accessMessage}
        </div>
      )}
    </>
  );
}
