import React from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import StudentList from './pages/students/StudentList';
import Settings from './pages/Settings';
import CertificatePage from './pages/students/CertificatePage';
import AttendancePage from './pages/AttendancePage'; // Import the new page
import EventsPage from './pages/EventsPage';
import { cn } from './lib/utils';

// Simple Error Boundary
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-600">
          <h1 className="text-2xl font-bold mb-4">Une erreur est survenue</h1>
          <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm">
            {this.state.error?.toString()}
          </pre>
          <button 
            className="mt-4 px-4 py-2 bg-primary text-white rounded"
            onClick={() => window.location.reload()}
          >
            Recharger l'application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

  return (
    <Link
      to={to}
      className={cn(
        "block py-2 px-4 rounded-md mb-1 transition-colors",
        isActive
          ? "bg-secondary text-secondary-foreground shadow-sm font-medium"
          : "hover:bg-secondary/50 hover:text-secondary-foreground text-primary-foreground/90"
      )}
    >
      {children}
    </Link>
  );
}

function Layout() {
  return (
    <div className="flex h-screen bg-background text-foreground font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-primary text-primary-foreground p-4 flex flex-col shadow-xl z-10">
        <div className="text-xl font-bold mb-8 pl-2 tracking-wide">Lycée Manjary Soa</div>
        <nav className="flex-1 space-y-1">
          <NavItem to="/">Tableau de bord</NavItem>
          <NavItem to="/students">Élèves</NavItem>
          <NavItem to="/attendance">Pointage</NavItem>
          <NavItem to="/events">Événements</NavItem>
          <NavItem to="/finance">Finance</NavItem>
          <NavItem to="/personnel">Personnel</NavItem>
          <NavItem to="/grades">Notes</NavItem>
          <NavItem to="/settings">Paramètres</NavItem>
        </nav>
        <div className="text-xs text-primary-foreground/60 text-center mt-4">
          v1.0.0
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-background p-6">
        <div className="w-full h-full">
          <Routes>
            <Route path="/" element={<div className="p-6">Tableau de bord (En construction)</div>} />
            <Route path="/students" element={<StudentList />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/certificate/:studentId" element={<CertificatePage />} />
            <Route path="/finance" element={<div className="p-6">Finance (En construction)</div>} />
            <Route path="/personnel" element={<div className="p-6">Personnel (En construction)</div>} />
            <Route path="/grades" element={<div className="p-6">Notes (En construction)</div>} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function App(): React.JSX.Element {
  return (
    <Router>
      <ErrorBoundary>
        <Layout />
      </ErrorBoundary>
    </Router>
  );
}

export default App;
