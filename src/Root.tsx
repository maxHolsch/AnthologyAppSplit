import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage/HomePage';
import { ViewerPage } from '@/pages/ViewerPage/ViewerPage';

export function Root() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/anthologies/:slug" element={<ViewerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

