import React from "react";
import { AlertTriangle } from "lucide-react";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

class ClanListErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "Unknown error" };
  }

  componentDidCatch(error: Error) {
    console.error("[ClanListErrorBoundary] Render crash:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="max-w-xl w-full bg-card border border-destructive/30 rounded-xl p-6 text-center space-y-3">
            <AlertTriangle className="w-7 h-7 text-destructive mx-auto" />
            <h2 className="font-display font-bold text-foreground">Clan List crashed</h2>
            <p className="text-sm text-muted-foreground break-words">
              {this.state.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center bg-secondary hover:bg-secondary/90 text-secondary-foreground font-display font-bold px-4 py-2 rounded-lg transition"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ClanListErrorBoundary;
