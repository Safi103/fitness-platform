import { NavLink, Outlet } from 'react-router-dom';
import BrandMark from './BrandMark.jsx';
import { useAuth } from '../context/AuthContext';

// App shell: gunmetal top bar with the plate mark, navigation, and session
// controls. New sections register a NavLink here as their modules land.
export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="topbar">
        <BrandMark />
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/workout">Workout</NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/catalog">Catalog</NavLink>
          <NavLink to="/routines">Routines</NavLink>
        </nav>
        <span className="user">{user ? user.name : ''}</span>
        <button type="button" className="btn btn-ghost" onClick={logout}>
          Log out
        </button>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
