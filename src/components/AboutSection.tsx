import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { User } from "lucide-react";

// Staff members configuration
const staffMembers = [
  {
    name: "M1K3",
    role: "Owner",
    avatar_url: "/images/staff/mike.png", // Placeholder - replace with actual path
  },
  {
    name: "WebDev",
    role: "Web Developer",
    avatar_url: "/images/staff/webdev.png", // Placeholder - replace with actual path
  },
  {
    name: "Admin1",
    role: "Clan Admin",
    avatar_url: "/images/staff/admin1.png", // Placeholder - replace with actual path
  },
  {
    name: "Admin2",
    role: "Clan Admin",
    avatar_url: "/images/staff/admin2.png", // Placeholder - replace with actual path
  },
];

const roleOrder = ["Owner", "Web Developer", "Clan Admin"];

const AboutSection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  // Group staff by role
  const staffByRole = roleOrder.map((role) => ({
    role,
    members: staffMembers.filter((member) => member.role === role),
  }));

  return (
    <section id="about" className="py-24 relative smoke-overlay">
      <div className="container mx-auto px-4" ref={ref}>
        {/* About Us Text */}
        <motion.div
          className="max-w-3xl mx-auto text-center mb-16"
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-display text-3xl sm:text-4xl font-bold uppercase mb-6 neon-text-blue text-primary">
            About 420 Clan
          </h2>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            We are <span className="text-primary font-semibold">420 Clan</span>, a 
            community built for lovers of the CosmicV KOTH FiveM server who want to 
            take their experience to the next level. Our texture pack made by{" "}
            <span className="text-primary font-semibold neon-text-blue">M1K3</span>{" "}
            is designed to fully transform your server experience with high-quality 
            custom content, clean weapon skins, and effects that pop to make your 
            gameplay look and feel unique.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { number: "50+", label: "Custom Textures" },
              { number: "24/7", label: "Community Support In Discord" },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                className="bg-card border border-border rounded-lg p-6 neon-border-blue"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.2 + i * 0.1, duration: 0.5 }}
              >
                <div className="font-display text-3xl font-black gradient-neon-text mb-1">
                  {stat.number}
                </div>
                <div className="text-muted-foreground text-sm uppercase tracking-wider">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Staff Team Section */}
        <motion.div
          className="max-w-6xl mx-auto"
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          <h3 className="font-display text-2xl sm:text-3xl font-bold uppercase mb-12 text-center neon-text-blue text-primary">
            Staff Team
          </h3>

          <div className="space-y-12">
            {staffByRole.map((group, groupIndex) => (
              <div key={group.role}>
                {/* Role Heading */}
                <h4 className="font-display text-xl font-bold uppercase mb-6 text-center text-secondary">
                  {group.role}
                </h4>

                {/* Staff Cards */}
                <div className="flex flex-wrap justify-center gap-6">
                  {group.members.map((member, memberIndex) => (
                    <motion.div
                      key={member.name}
                      className="bg-card border border-border rounded-lg p-6 text-center hover:border-primary/50 transition-all duration-300 neon-border-blue-subtle w-full sm:w-[280px]"
                      initial={{ opacity: 0, y: 20 }}
                      animate={isInView ? { opacity: 1, y: 0 } : {}}
                      transition={{
                        delay: 0.5 + groupIndex * 0.1 + memberIndex * 0.05,
                        duration: 0.5,
                      }}
                    >
                      {/* Avatar */}
                      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted border-2 border-primary/30 flex items-center justify-center overflow-hidden">
                        <img
                          src={member.avatar_url}
                          alt={member.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback to icon if image fails to load
                            e.currentTarget.style.display = "none";
                            const parent = e.currentTarget.parentElement;
                            if (parent && !parent.querySelector(".fallback-icon")) {
                              const icon = document.createElement("div");
                              icon.className = "fallback-icon";
                              icon.innerHTML = '<svg class="w-10 h-10 text-muted-foreground" stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
                              parent.appendChild(icon);
                            }
                          }}
                        />
                      </div>

                      {/* Name */}
                      <h5 className={`font-display text-lg font-bold mb-2 ${
                        member.name === "M1K3" ? "neon-text-blue" : "text-foreground"
                      }`}>
                        {member.name}
                      </h5>

                      {/* Role Badge */}
                      <div className="inline-block px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-xs font-semibold text-primary uppercase tracking-wide">
                        {member.role}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default AboutSection;
