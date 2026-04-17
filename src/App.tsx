import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Chat from './pages/Chat.jsx';
import Login from './pages/Login';
import Register from './pages/Register';

/**
 * ProtectedRoute Component
 * This checks if a user is logged in. 
 * If not, it kicks them back to the Login page.
 */
const ProtectedRoute = ({ children }) => {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Main Chat Page - Protected */}
          <Route path="/" element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          } />

          {/* Auth Pages */}
          <Route path="/login" element={<Login type="login" />} />
          <Route path="/register" element={<Register type="register" />} />

          {/* Fallback: redirect any unknown path to home */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;