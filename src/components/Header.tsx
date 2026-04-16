export default function Header() {
  return (
    <header className="bg-primary text-white py-6 shadow-md">
      <div className="container mx-auto flex flex-col items-center px-4">
        <h1 className="text-4xl font-serif font-bold tracking-widest">
          EL DEBER
        </h1>
        <p className="text-xs mt-1 tracking-widest">TRANSMISIONES EN VIVO</p>
        <nav className="mt-4">
          <ul className="flex gap-8 text-sm font-semibold tracking-wide">
            <li>
              <a href="#" className="hover:text-gray-200 transition">
                Inicio
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-gray-200 transition">
                Tendencias
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-gray-200 transition">
                Contacto
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
