import React from "react";

interface UserCardProps {
  username: string;
  viewerCount: number;
  isFeatured?: boolean;
}

export default function UserCard({
  username,
  viewerCount,
  isFeatured = false,
}: UserCardProps) {
  return (
    <div
      className={`bg-white rounded-lg shadow-md p-6 mb-4 transition-all duration-200 hover:shadow-xl hover:-translate-y-1 border-2 ${
        isFeatured
          ? "border-primary scale-105 bg-gradient-to-r from-primary/5 to-transparent"
          : "border-transparent hover:border-primary/20"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl text-primary mb-2 truncate">
            @{username}
          </h2>
          <p className="font-sans text-gray-700 text-lg flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            {viewerCount.toLocaleString("es-ES")}{" "}
            <span className="text-sm text-gray-500">espectadores en vivo</span>
          </p>
        </div>
        {isFeatured && (
          <div className="ml-4 bg-primary text-white px-4 py-2 rounded text-xs font-bold">
            DESTACADO
          </div>
        )}
      </div>
    </div>
  );
}
