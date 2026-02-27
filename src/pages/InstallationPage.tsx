// Installation Guide — step-by-step texture pack installation instructions
// Accessible to private/staff only
import { useAuth } from "@/context/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Download,
  FolderOpen,
  FolderArchive,
  Trash2,
  Copy,
  CheckCircle,
  Loader2,
  LogOut,
  AlertTriangle,
  BookOpen,
} from "lucide-react";
import clanLogo from "@/assets/clan-logo.png";

const DOWNLOAD_URL = "/pack#download";

interface Step {
  number: number;
  title: string;
  description: string;
  icon: React.ElementType;
  note?: string;
  warning?: boolean;
}

const steps: Step[] = [
  {
    number: 1,
    title: "Download the Texture Pack",
    description:
      'Click the download button below, or go to the Pack page and hit "Download .RAR". This will take you to a Google Drive folder.',
    icon: Download,
  },
  {
    number: 2,
    title: "Download the Google Drive File",
    description:
      "Download the .rar file from Google Drive to your computer. It may take a while depending on your internet speed.",
    icon: Download,
  },
  {
    number: 3,
    title: "Extract to a New Folder",
    description:
      'Right-click the downloaded .rar file and choose "Extract here" or "Extract to folder". You need WinRAR or 7-Zip to do this. You should now have three folders: Citizen, mods, and plugins.',
    icon: FolderArchive,
  },
  {
    number: 4,
    title: "Navigate to Your FiveM Directory",
    description: "Open File Explorer and navigate to:",
    icon: FolderOpen,
    note: "C:\\Users\\YOUR_USER\\AppData\\Local\\FiveM\\FiveM.app",
  },
  {
    number: 5,
    title: "Backup Your Current Folders",
    description:
      'Before deleting anything, make a backup! Copy the existing Citizen, mods, and plugins folders to a safe location (e.g. your Desktop). This way you can always go back if something goes wrong.',
    icon: Copy,
    warning: true,
  },
  {
    number: 6,
    title: "Delete the Old Folders",
    description:
      "Delete the existing Citizen, mods, and plugins folders from the FiveM.app directory. Make sure you have a backup from the previous step!",
    icon: Trash2,
    warning: true,
  },
  {
    number: 7,
    title: "Copy the New Folders",
    description:
      "Drag and copy the new Citizen, mods, and plugins folders (from step 3) into the FiveM.app directory.",
    icon: Copy,
  },
  {
    number: 8,
    title: "Done!",
    description:
      'Launch FiveM and enjoy the new textures! If you properly deleted the old folders before copying, there should be no file conflicts.',
    icon: CheckCircle,
  },
];

const InstallationPage = () => {
  const { user, loading } = useAuth();

  // Guard: must be logged in + have private or staff role
  if (!loading && (!user || (!user.is_private && !user.is_staff))) {
    return <Navigate to="/dashboard" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top bar ─────────────────────────────────────── */}
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
        className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border shadow-lg"
      >
        <div className="container mx-auto px-4 flex items-center justify-between h-16">
          <Link
            to="/pack"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <img src={clanLogo} alt="420 Clan Logo" className="w-8 h-8 rounded-full" />
            <span className="font-display text-sm font-bold hidden sm:block">
              Back to homepage
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <span className="font-display text-lg font-bold text-primary hidden sm:block">
              Installation Guide
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {user!.avatar && (
                <img
                  src={user!.avatar}
                  alt=""
                  className="w-8 h-8 rounded-full border border-border"
                />
              )}
              <span className="text-sm text-foreground hidden sm:block">
                {user!.username}
              </span>
            </div>
            <a
              href="/.netlify/functions/logout"
              className="text-muted-foreground hover:text-destructive transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </a>
          </div>
        </div>
      </motion.nav>

      {/* ── Content ─────────────────────────────────────── */}
      <div className="container mx-auto px-4 max-w-3xl py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="font-display text-3xl sm:text-4xl font-bold uppercase mb-2 text-center neon-text-blue text-primary">
            Installation Guide
          </h1>
          <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
            Follow these steps to install the 420 Clan Texture Pack for FiveM.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="space-y-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 * i, duration: 0.4 }}
              className={`bg-card border rounded-lg p-6 transition-all duration-300 ${
                step.warning
                  ? "border-yellow-500/50 hover:neon-border-purple"
                  : "border-border hover:neon-border-blue"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                    step.number === steps.length
                      ? "bg-green-600/20 text-green-400"
                      : step.warning
                      ? "bg-yellow-600/20 text-yellow-400"
                      : "bg-primary/20 text-primary"
                  }`}
                >
                  <step.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-display text-xs text-muted-foreground uppercase tracking-wider">
                      Step {step.number}
                    </span>
                    {step.warning && (
                      <span className="flex items-center gap-1 text-yellow-400 text-xs">
                        <AlertTriangle className="w-3 h-3" />
                        Important
                      </span>
                    )}
                  </div>
                  <h3 className="font-display text-lg font-bold text-foreground mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                  {step.note && (
                    <code className="mt-3 block bg-muted border border-border rounded-lg px-4 py-2.5 text-sm text-primary font-mono break-all">
                      {step.note}
                    </code>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Download CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="mt-12 text-center"
        >
          <a
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 bg-primary text-primary-foreground font-display font-bold text-lg px-10 py-4 rounded-lg neon-box-blue hover:scale-105 transition-transform duration-200 uppercase tracking-wider"
          >
            <Download className="w-6 h-6" />
            Download Texture Pack
          </a>
          <p className="text-muted-foreground text-xs mt-4">
            You need <span className="text-primary">WinRAR</span> or{" "}
            <span className="text-primary">7-Zip</span> to extract the .rar file.
          </p>
        </motion.div>

        {/* Tip box */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="mt-8 bg-card border border-border rounded-lg p-6 neon-border-blue"
        >
          <h4 className="font-display text-sm font-bold text-primary uppercase tracking-wider mb-2">
            Troubleshooting
          </h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary flex-shrink-0 leading-[1.25rem]">•</span>
              If you can't find the AppData folder, type <code className="text-primary bg-muted px-1 rounded">%localappdata%</code> in the File Explorer address bar and press Enter.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary flex-shrink-0 leading-[1.25rem]">•</span>
              Make sure FiveM is closed before replacing the folders.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary flex-shrink-0 leading-[1.25rem]">•</span>
              If textures don't appear, try clearing your FiveM cache.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary flex-shrink-0 leading-[1.25rem]">•</span>
              For any questions, send a DM on Discord:{" "}
              <span className="text-primary font-mono">m1k3_1206</span>
            </li>
          </ul>
        </motion.div>
      </div>
    </div>
  );
};

export default InstallationPage;
