import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CatalogPage from './pages/CatalogPage.jsx';
import RoutinesPage from './pages/RoutinesPage.jsx';
import RoutineBuilderPage from './pages/RoutineBuilderPage.jsx';
import WorkoutStartPage from './pages/WorkoutStartPage.jsx';
import LiveWorkoutPage from './pages/LiveWorkoutPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import WorkoutDetailPage from './pages/WorkoutDetailPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/routines" element={<RoutinesPage />} />
              <Route path="/routines/new" element={<RoutineBuilderPage />} />
              <Route path="/routines/:id/edit" element={<RoutineBuilderPage />} />
              <Route path="/workout" element={<WorkoutStartPage />} />
              <Route path="/workout/live" element={<LiveWorkoutPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/history/:id" element={<WorkoutDetailPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
