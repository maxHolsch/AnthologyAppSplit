import { useParams } from 'react-router-dom';
import App from '@/App';

export function ViewerPage() {
  const { slug } = useParams();
  return <App anthologySlug={slug} />;
}

