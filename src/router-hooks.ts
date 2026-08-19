import { useNavigate as useRouterNavigate, useParams as useRouterParams } from "react-router";
import { Path, Params } from './routes';

// Export hooks with type safety
export const useNavigate = () => {
  const navigate = useRouterNavigate();
  return (to: Path | number, options?: {
    replace?: boolean;
    state?: any;
  }) => {
    if (typeof to === 'number') {
      navigate(to);
    } else {
      navigate(to, options);
    }
  };
};
export const useParams = useRouterParams<Params>;
