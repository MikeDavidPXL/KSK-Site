import clanLogo from "@/assets/ksk.png";

const Footer = () => (
  <footer className="border-t border-border py-8">
    <div className="container mx-auto px-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <img src={clanLogo} alt="KSK" className="w-6 h-6 rounded-full" />
          <span className="font-display text-xs font-bold text-muted-foreground uppercase tracking-wider">
            [KSK] Kommando Spezialkräfte © 2026
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          Not affiliated with Rockstar Games or FiveM.
        </p>
      </div>
      <div className="text-center space-y-1">
        <p className="text-muted-foreground text-xs font-semibold">
          Website made by M1k3
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
