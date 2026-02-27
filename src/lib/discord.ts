export function getDiscordDefaultAvatarIndex(discordId?: string | null): number {
  if (!discordId) return 0;
  try {
    return Number(BigInt(discordId) % 6n);
  } catch {
    return 0;
  }
}

export function buildDiscordAvatarUrl(
  discordId?: string | null,
  avatarHash?: string | null
): string {
  if (discordId && avatarHash) {
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png?v=${avatarHash}`;
  }

  const index = getDiscordDefaultAvatarIndex(discordId);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
