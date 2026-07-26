import { useLocation } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";

const NotFound = () => {
  const location = useLocation();

  usePageSeo({
    title: "Page not found — Verdant Grow Diary",
    description: "The page you requested does not exist. Return to Verdant Grow Diary.",
    path: location.pathname || "/404",
    noindex: true,
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </main>
  );
};

export default NotFound;
