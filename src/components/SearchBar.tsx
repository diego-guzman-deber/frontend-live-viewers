import React, { useState } from "react";

interface SearchBarProps {
  onSearch: (username: string) => void;
  loading: boolean;
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSearch(input.trim());
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-2 mb-8 w-full max-w-md mx-auto"
    >
      <input
        type="text"
        placeholder="Buscar usuario de TikTok..."
        className="flex-1 px-4 py-3 rounded-l-md border-2 border-gray-300 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-sans text-sm"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={loading}
      />
      <button
        type="submit"
        className="bg-primary text-white px-6 py-3 rounded-r-md font-semibold hover:bg-green-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={loading}
      >
        {loading ? "Buscando..." : "Buscar"}
      </button>
    </form>
  );
}
