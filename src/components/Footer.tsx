import clanLogo from "@/assets/clan-logo.png";

const Footer = () => (
  <footer className="border-t border-border py-8">
    <div className="container mx-auto px-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <img src={clanLogo} alt="420 Clan" className="w-6 h-6 rounded-full" />
          <span className="font-display text-xs font-bold text-muted-foreground uppercase tracking-wider">
            420 Clan © 2026
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          Not affiliated with Rockstar Games or FiveM.
        </p>
      </div>
      <div className="text-center space-y-1">
        <p className="text-muted-foreground text-xs font-semibold">
          Pack made by <span className="text-primary">Mike</span>
        </p>
        <p className="text-muted-foreground text-xs font-semibold">
          Website made by <span className="text-primary">Mike</span>
        </p>
        <p className="text-muted-foreground text-xs">
          For any questions send a DM on Discord: <span className="text-primary font-mono">m1k3_1206</span>
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
