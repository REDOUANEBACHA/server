import { prisma } from "../lib/prisma.js";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
}

// Send push notification via Expo Push Service
async function sendPushNotifications(messages: ExpoPushMessage[]) {
  if (messages.length === 0) return;

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  const result = await response.json();
  console.log("Push notifications sent:", result);
  return result;
}

// Notify user when handicap is updated
export async function notifyHandicapUpdate(userId: string, oldHandicap: number, newHandicap: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.pushToken) return;

  const improved = newHandicap < oldHandicap;
  const diff = Math.abs(newHandicap - oldHandicap).toFixed(1);

  await sendPushNotifications([{
    to: user.pushToken,
    title: improved ? "Handicap amélioré ! 🎉" : "Handicap mis à jour",
    body: improved
      ? `Bravo ! Ton handicap est passé de ${oldHandicap.toFixed(1)} à ${newHandicap.toFixed(1)} (-${diff})`
      : `Ton handicap est passé de ${oldHandicap.toFixed(1)} à ${newHandicap.toFixed(1)} (+${diff})`,
    data: { screen: "/(tabs)/profile" },
    sound: "default",
  }]);
}

// Notify user after completing a round
export async function notifyRoundSummary(userId: string, courseName: string, score: number, par: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.pushToken) return;

  const diff = score - par;
  const diffStr = diff === 0 ? "par" : diff > 0 ? `+${diff}` : `${diff}`;

  await sendPushNotifications([{
    to: user.pushToken,
    title: "Partie enregistrée ⛳",
    body: `${courseName} — Score: ${score} (${diffStr}). Continue comme ça !`,
    data: { screen: "/(tabs)/history" },
    sound: "default",
  }]);
}

// Notify group creator when a new member joins
export async function notifyGroupNewMember(groupCreatorId: string, memberName: string, groupName: string, groupId: string) {
  const creator = await prisma.user.findUnique({ where: { id: groupCreatorId } });
  if (!creator?.pushToken) return;

  await sendPushNotifications([{
    to: creator.pushToken,
    title: "Nouveau membre ! 👥",
    body: `${memberName} a rejoint votre groupe "${groupName}"`,
    data: { screen: `/group/${groupId}` },
    sound: "default",
  }]);
}

// Notify group members when ranking changes after a round
export async function notifyRankingChanges(userId: string, oldHandicap: number, newHandicap: number) {
  // Only notify if handicap actually changed
  if (oldHandicap === newHandicap) return;

  // Find all groups this user belongs to
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    include: {
      group: {
        include: {
          members: {
            include: {
              user: { select: { id: true, name: true, handicap: true, pushToken: true } },
            },
          },
        },
      },
    },
  });

  const playerName = memberships[0]?.group.members.find((m) => m.userId === userId)?.user.name;
  if (!playerName) return;

  const messages: ExpoPushMessage[] = [];

  for (const membership of memberships) {
    const group = membership.group;
    const members = group.members.map((m) => m.user);

    // Build old ranking (before handicap change) and new ranking
    const oldRanking = [...members]
      .map((m) => ({ ...m, handicap: m.id === userId ? oldHandicap : m.handicap }))
      .sort((a, b) => a.handicap - b.handicap);

    const newRanking = [...members]
      .sort((a, b) => a.handicap - b.handicap);

    const oldRank = oldRanking.findIndex((m) => m.id === userId);
    const newRank = newRanking.findIndex((m) => m.id === userId);

    // Player moved up in ranking
    if (newRank < oldRank) {
      // Notify the player who improved
      const player = members.find((m) => m.id === userId);
      if (player?.pushToken) {
        messages.push({
          to: player.pushToken,
          title: `${getRankEmoji(newRank)} ${group.name}`,
          body: `Bravo ! Tu es maintenant ${formatRank(newRank + 1)} du classement !`,
          data: { screen: `/group/${group.id}` },
          sound: "default",
        });
      }

      // Notify each member who got surpassed
      for (let i = newRank + 1; i <= oldRank; i++) {
        const surpassed = newRanking[i];
        if (surpassed && surpassed.id !== userId && surpassed.pushToken) {
          const surpassedNewRank = i;
          messages.push({
            to: surpassed.pushToken,
            title: `📉 ${group.name}`,
            body: `${playerName} t'a dépassé ! Tu es maintenant ${formatRank(surpassedNewRank + 1)}.`,
            data: { screen: `/group/${group.id}` },
            sound: "default",
          });
        }
      }
    }
  }

  if (messages.length > 0) {
    await sendPushNotifications(messages);
  }
}

function formatRank(rank: number): string {
  if (rank === 1) return "1er";
  return `${rank}ème`;
}

function getRankEmoji(rank: number): string {
  if (rank === 0) return "🥇";
  if (rank === 1) return "🥈";
  if (rank === 2) return "🥉";
  return "📈";
}

// Notify all users about a new course
export async function notifyNewCourse(courseName: string, city: string) {
  const users = await prisma.user.findMany({
    where: { pushToken: { not: null } },
    select: { pushToken: true },
  });

  const messages: ExpoPushMessage[] = users
    .filter((u) => u.pushToken)
    .map((u) => ({
      to: u.pushToken!,
      title: "Nouveau parcours disponible ! 🏌️",
      body: `${courseName} à ${city} vient d'être ajouté. Découvre-le sur la carte !`,
      data: { screen: "/(tabs)/map" },
      sound: "default" as const,
    }));

  await sendPushNotifications(messages);
}
