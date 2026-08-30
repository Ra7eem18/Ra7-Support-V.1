require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, StringSelectMenuBuilder, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, AttachmentBuilder,
  ButtonBuilder, ButtonStyle,
} = require('discord.js');
const store = require('./store');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});


const pending = new Map();

const BANNER_PATH = path.join(__dirname, 'assets', 'banner.png');
function bannerAttachment() {
  if (fs.existsSync(BANNER_PATH)) {
    return new AttachmentBuilder(BANNER_PATH, { name: 'banner.png' });
  }
  return null;
}

client.once('ready', () => {
    console.log(`
 ╔══════════════════════════════════════════════════╗
 ║                  Ra7-Dev                         ║
 ║                                                  ║
 ║              Developer: Ra7eem                   ║
 ║              © 2026 Ra7-Dev                      ║
 ║              All Rights Reserved                 ║
 ║                                                  ║
 ║          https://discord.gg/WCnn2KBZJB           ║
 ╚══════════════════════════════════════════════════╝
    `);

    console.log(`✅ تم تسجيل الدخول باسم ${client.user.tag}`);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const guild = newState.guild;
    if (!newState.channelId) return;
    if (oldState.channelId === newState.channelId) return;

    const member = newState.member;
    if (member.user.bot) return;

    const cfg = store.getConfig(guild.id);
    if (cfg.doneChannelId && newState.channelId === cfg.doneChannelId) {
      await sendFeedbackRequest(member, guild.id);
      return;
    }

    const rooms = store.getRooms(guild.id);
    const matchedEntry = Object.entries(rooms).find(
      ([, room]) => room.waitingChannelId === newState.channelId
    );
    if (!matchedEntry) return;

    const [roomKey, roomInfo] = matchedEntry;

    const admins = store.getAllAdmins(guild.id);
    const candidates = Object.entries(admins).filter(([userId, data]) => {
      if (userId === '__lastPicked') return false;
      return data.status === 'available' && data.assignments && data.assignments[roomKey];
    });

    if (candidates.length === 0) {
      try {
        await member.send(
          `⏳ دخلت غرفة **${roomInfo.label}** في سيرفر **${guild.name}**، لكن لا يوجد إداري متاح حاليًا. الرجاء الانتظار قليلًا.`
        );
      } catch (_) { /* الخاص مقفول، تجاهل */ }
      return;
    }

    // توزيع بالتناوب بين الإداريين المتاحين
    const lastPicked = store.getLastPicked(guild.id, roomKey);
    let pickIndex = 0;
    if (lastPicked) {
      const lastIndex = candidates.findIndex(([id]) => id === lastPicked);
      pickIndex = (lastIndex + 1) % candidates.length;
    }
    const [chosenAdminId, chosenAdminData] = candidates[pickIndex];
    const targetChannelId = chosenAdminData.assignments[roomKey];
    const targetChannel = guild.channels.cache.get(targetChannelId);
    if (!targetChannel) return;

    await member.voice.setChannel(targetChannel, `سحب تلقائي لغرفة ${roomInfo.label}`);
    store.setLastPicked(guild.id, roomKey, chosenAdminId);

    try {
      const adminMember = await guild.members.fetch(chosenAdminId);
      await adminMember.send(
        `🔔 تم سحب **${member.user.tag}** إليك في **${targetChannel.name}** لطلب: **${roomInfo.label}**`
      );
    } catch (_) { /* الخاص مقفول، تجاهل */ }

  } catch (err) {
    console.error('خطأ في voiceStateUpdate:', err);
  }
});

async function sendFeedbackRequest(member, guildId) {
  const embed = new EmbedBuilder()
    .setTitle('✅ انتهت خدمتك')
    .setDescription('شكرًا لتواجدك معنا! نحتاج تقييمك وملاحظاتك إن وجدت لتحسين الخدمة.\nاختر تقييمك بالأسفل (من ⭐ إلى ⭐⭐⭐⭐⭐):')
    .setColor(0xF1C40F);

  const row = new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map(n =>
      new ButtonBuilder()
        .setCustomId(`rate|${guildId}|${n}`)
        .setLabel('⭐'.repeat(n))
        .setStyle(ButtonStyle.Secondary)
    )
  );

  try {
    await member.send({ embeds: [embed], components: [row] });
  } catch (_) { /* الخاص مقفول عند العضو، تجاهل */ }
}

function buildSupportMenu(isAdmin) {
  const options = [
    { label: 'متاح', value: 'go_available', description: 'يمكن سحب الأعضاء إليك', emoji: '✅' },
    { label: 'مشغول', value: 'go_busy', description: 'ما ينسحب لك أحد', emoji: '⛔' },
    { label: 'عيّني على غرفة', value: 'assign_room', description: 'اختر غرفة وروم الاستقبال الخاص فيك', emoji: '🎯' },
    { label: 'الغِ تعييني من غرفة', value: 'unassign_room', description: 'احذف أحد تعييناتك', emoji: '🚫' },
    { label: 'حالتي', value: 'view_status', description: 'اعرض حالتك وتعييناتك', emoji: '📋' },
    { label: 'كل الغرف', value: 'view_rooms', description: 'اعرض كل الغرف المُعدة', emoji: '📂' },
  ];
  if (isAdmin) {
    options.push(
      { label: 'إنشاء / تعديل غرفة', value: 'setup_room', description: '(للمشرفين) أنشئ غرفة انتظار جديدة', emoji: '🛠️' },
      { label: 'حذف غرفة', value: 'delete_room', description: '(للمشرفين) احذف غرفة انتظار', emoji: '🗑️' },
      { label: 'تحديد روم الانتهاء', value: 'set_done_channel', description: '(للمشرفين) الروم الذي يُطلب فيه التقييم', emoji: '🏁' },
    );
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId('support_menu')
    .setPlaceholder('اختر إجراء...')
    .addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

function buildSupportEmbed() {
  return new EmbedBuilder()
    .setTitle('🎛️ لوحة تحكم توجيه الدعم')
    .setDescription('استخدم القائمة بالأسفل للتحكم بحالتك وتعييناتك.\nهذه اللوحة ثابتة — اختيار أي خيار يرد عليك بشكل خاص فقط.')
    .setColor(0x5865F2)
    .setImage(fs.existsSync(BANNER_PATH) ? 'attachment://banner.png' : null);
}


function buildManageMenu(isAdmin) {
  const options = [
    { label: 'تسجيل دخول', value: 'check_in', description: 'ابدأ جلسة عملك', emoji: '🟢' },
    { label: 'تسجيل خروج', value: 'check_out', description: 'أنهِ جلستك واحصل على نقاطك', emoji: '🔴' },
    { label: 'ساعاتي ونقاطي', value: 'my_hours', description: 'اعرض إجمالي وقتك ونقاطك', emoji: '📊' },
    { label: 'المتصدرين', value: 'leaderboard', description: 'أفضل الأعضاء من حيث النقاط', emoji: '🏆' },
  ];
  if (isAdmin) {
    options.push(
      { label: 'تحديد معدل النقاط', value: 'set_rate', description: '(للمشرفين) عدد النقاط لكل ساعة كاملة', emoji: '⚙️' },
      { label: 'آخر التقييمات', value: 'view_feedback', description: '(للمشرفين) اعرض آخر تقييمات الأعضاء', emoji: '📝' },
    );
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId('manage_menu')
    .setPlaceholder('اختر إجراء...')
    .addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

function buildManageEmbed(guildId) {
  const cfg = store.getConfig(guildId);
  return new EmbedBuilder()
    .setTitle('🗂️ لوحة تحكم إدارة الفريق')
    .setDescription(`سجّل دخولك عند بدء العمل، وسجّل خروجك عند الانتهاء.\nتكسب **${cfg.pointsPerHour} نقطة** لكل ساعة كاملة تكملها.\nهذه اللوحة ثابتة — اختيار أي خيار يرد عليك بشكل خاص فقط.`)
    .setColor(0x2ECC71)
    .setImage(fs.existsSync(BANNER_PATH) ? 'attachment://banner.png' : null);
}

function roomPickerMenu(customId, rooms, placeholder) {
  const entries = Object.entries(rooms);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(entries.map(([key, r]) => ({
      label: r.label,
      value: key,
      description: `المفتاح: ${key}`,
    })));
  return new ActionRowBuilder().addComponents(menu);
}

function channelPickerMenu(customId, placeholder) {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addChannelTypes(ChannelType.GuildVoice);
  return new ActionRowBuilder().addComponents(menu);
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h} ساعة و ${m} دقيقة`;
}


async function postPersistentPanel(interaction, panelType, embed, components) {
  const { guild, channel } = interaction;
  const attachment = bannerAttachment();
  const existing = store.getPanel(guild.id, panelType);

  if (existing) {
    try {
      const oldChannel = await guild.channels.fetch(existing.channelId).catch(() => null);
      if (oldChannel) {
        const oldMsg = await oldChannel.messages.fetch(existing.messageId).catch(() => null);
        if (oldMsg) {
          if (oldMsg.pinned) await oldMsg.unpin().catch(() => {});
          await oldMsg.delete().catch(() => {});
        }
      }
    } catch (_) { /* تجاهل فشل التنظيف */ }
  }

  const sent = await channel.send({
    embeds: [embed],
    components,
    files: attachment ? [attachment] : [],
  });
  try {
    await sent.pin();
  } catch (_) { /* صلاحية Manage Messages غير متوفرة، تجاهل */ }

  store.setPanel(guild.id, panelType, channel.id, sent.id);
  return sent;
}

client.on('interactionCreate', async (interaction) => {
  try {
    // ---------- تفاعلات التقييم تصل عبر الخاص (بدون سيرفر) ----------
    if (interaction.isButton() && interaction.customId.startsWith('rate|')) {
      const [, guildId, ratingStr] = interaction.customId.split('|');
      const modal = new ModalBuilder()
        .setCustomId(`feedback_modal|${guildId}|${ratingStr}`)
        .setTitle('ملاحظاتك (اختياري)')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('feedback')
              .setLabel('شاركنا ملاحظاتك إن وجدت')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('feedback_modal|')) {
      const [, guildId, ratingStr] = interaction.customId.split('|');
      const feedback = interaction.fields.getTextInputValue('feedback')?.trim() || '';
      store.addFeedback(guildId, interaction.user.id, Number(ratingStr), feedback);
      return interaction.reply({ content: '🙏 شكرًا لك! تم استلام تقييمك وملاحظاتك.' });
    }

    const { guild, member } = interaction;
    if (!guild) return;
    const isAdmin = member.permissions.has(PermissionFlagsBits.ManageGuild);

    if (interaction.isChatInputCommand() && interaction.commandName === 'support') {
      await interaction.deferReply({ ephemeral: true });
      await postPersistentPanel(interaction, 'support', buildSupportEmbed(), [buildSupportMenu(isAdmin)]);
      return interaction.editReply({ content: '✅ تم نشر اللوحة وتثبيتها في هذا الروم.' });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'manage-support') {
      await interaction.deferReply({ ephemeral: true });
      await postPersistentPanel(interaction, 'manage', buildManageEmbed(guild.id), [buildManageMenu(isAdmin)]);
      return interaction.editReply({ content: '✅ تم نشر اللوحة وتثبيتها في هذا الروم.' });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'support_menu') {
      const choice = interaction.values[0];

      if (choice === 'go_available') {
        const adminData = store.getAdmin(guild.id, member.id);
        adminData.status = 'available';
        store.saveAdmin(guild.id, member.id, adminData);
        return interaction.reply({ content: '✅ تم تحديث حالتك إلى **متاح**.', ephemeral: true });
      }

      if (choice === 'go_busy') {
        const adminData = store.getAdmin(guild.id, member.id);
        adminData.status = 'busy';
        store.saveAdmin(guild.id, member.id, adminData);
        return interaction.reply({ content: '⛔ تم تحديث حالتك إلى **مشغول**.', ephemeral: true });
      }

      if (choice === 'view_status') {
        const adminData = store.getAdmin(guild.id, member.id);
        const rooms = store.getRooms(guild.id);
        const lines = Object.entries(adminData.assignments || {}).map(([key, channelId]) => {
          const label = rooms[key] ? rooms[key].label : key;
          return `• **${label}** ← <#${channelId}>`;
        });
        const embed = new EmbedBuilder()
          .setTitle('حالتك الحالية')
          .setColor(adminData.status === 'available' ? 0x57F287 : 0xED4245)
          .addFields(
            { name: 'الحالة', value: adminData.status === 'available' ? 'متاح ✅' : 'مشغول ⛔' },
            { name: 'التعيينات', value: lines.length ? lines.join('\n') : 'لا يوجد تعيينات بعد' },
          );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (choice === 'view_rooms') {
        const rooms = store.getRooms(guild.id);
        const entries = Object.entries(rooms);
        const content = entries.length
          ? entries.map(([key, r]) => `• \`${key}\` — **${r.label}** (روم الانتظار: <#${r.waitingChannelId}>)`).join('\n')
          : 'لا توجد غرف معدة بعد.';
        return interaction.reply({ content, ephemeral: true });
      }

      if (choice === 'assign_room') {
        const rooms = store.getRooms(guild.id);
        if (Object.keys(rooms).length === 0) {
          return interaction.reply({ content: '❌ لا توجد غرف بعد. اطلب من مشرف إنشاء واحدة أولًا.', ephemeral: true });
        }
        return interaction.reply({
          content: 'أي غرفة تبي تستقبل طلباتها؟',
          components: [roomPickerMenu('pick_room_for_assign', rooms, 'اختر غرفة')],
          ephemeral: true,
        });
      }

      if (choice === 'unassign_room') {
        const adminData = store.getAdmin(guild.id, member.id);
        const rooms = store.getRooms(guild.id);
        const assignedKeys = Object.keys(adminData.assignments || {});
        if (assignedKeys.length === 0) {
          return interaction.reply({ content: 'ما عندك أي تعيينات تحذفها.', ephemeral: true });
        }
        const subset = Object.fromEntries(assignedKeys.map(k => [k, rooms[k] || { label: k }]));
        return interaction.reply({
          content: 'أي تعيين تبي تحذفه؟',
          components: [roomPickerMenu('pick_room_for_unassign', subset, 'اختر غرفة')],
          ephemeral: true,
        });
      }

      if (choice === 'setup_room') {
        if (!isAdmin) return interaction.reply({ content: '❌ هذا الخيار للمشرفين فقط.', ephemeral: true });
        const modal = new ModalBuilder()
          .setCustomId('modal_setup_room')
          .setTitle('إنشاء / تعديل غرفة')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('key').setLabel('المفتاح (بدون مسافات، مثل support)')
                .setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('label').setLabel('الاسم الظاهر (مثل دعم فني)')
                .setStyle(TextInputStyle.Short).setRequired(true)
            ),
          );
        return interaction.showModal(modal);
      }

      if (choice === 'delete_room') {
        if (!isAdmin) return interaction.reply({ content: '❌ هذا الخيار للمشرفين فقط.', ephemeral: true });
        const rooms = store.getRooms(guild.id);
        if (Object.keys(rooms).length === 0) {
          return interaction.reply({ content: '❌ لا توجد غرف بعد.', ephemeral: true });
        }
        return interaction.reply({
          content: 'أي غرفة تبي تحذفها؟',
          components: [roomPickerMenu('pick_room_for_delete', rooms, 'اختر غرفة')],
          ephemeral: true,
        });
      }

      if (choice === 'set_done_channel') {
        if (!isAdmin) return interaction.reply({ content: '❌ هذا الخيار للمشرفين فقط.', ephemeral: true });
        return interaction.reply({
          content: 'اختر الروم الصوتي الذي يُنقل له العضو بعد انتهاء خدمته (روم "الانتهاء"):',
          components: [channelPickerMenu('pick_channel_for_done', 'اختر روم الانتهاء')],
          ephemeral: true,
        });
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'pick_room_for_assign') {
      const roomKey = interaction.values[0];
      pending.set(member.id, { action: 'assign_room', roomKey });
      return interaction.update({
        content: 'الآن اختر روومك الصوتي الشخصي (الذي يُسحب له الأعضاء):',
        components: [channelPickerMenu('pick_channel_for_assign', 'اختر روومك')],
      });
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === 'pick_channel_for_assign') {
      const state = pending.get(member.id);
      if (!state) return interaction.update({ content: '❌ صار خطأ، جرب مرة ثانية من اللوحة.', components: [] });
      const channel = interaction.channels.first();
      const adminData = store.getAdmin(guild.id, member.id);
      adminData.assignments[state.roomKey] = channel.id;
      store.saveAdmin(guild.id, member.id, adminData);
      pending.delete(member.id);
      const rooms = store.getRooms(guild.id);
      const label = rooms[state.roomKey] ? rooms[state.roomKey].label : state.roomKey;
      return interaction.update({
        content: `✅ تم تعيينك على **${label}**، يتم سحب الأعضاء إلى <#${channel.id}>.`,
        components: [],
      });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'pick_room_for_unassign') {
      const roomKey = interaction.values[0];
      const adminData = store.getAdmin(guild.id, member.id);
      delete adminData.assignments[roomKey];
      store.saveAdmin(guild.id, member.id, adminData);
      return interaction.update({ content: `✅ تم حذف تعيينك من \`${roomKey}\`.`, components: [] });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'pick_room_for_delete') {
      const roomKey = interaction.values[0];
      store.deleteRoom(guild.id, roomKey);
      return interaction.update({ content: `🗑️ تم حذف الغرفة \`${roomKey}\`.`, components: [] });
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_setup_room') {
      const key = interaction.fields.getTextInputValue('key').trim();
      const label = interaction.fields.getTextInputValue('label').trim();
      pending.set(member.id, { action: 'setup_room', key, label });
      return interaction.reply({
        content: `الآن اختر روم الانتظار الصوتي لـ **${label}**:`,
        components: [channelPickerMenu('pick_channel_for_setup', 'اختر روم الانتظار')],
        ephemeral: true,
      });
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === 'pick_channel_for_setup') {
      const state = pending.get(member.id);
      if (!state) return interaction.update({ content: '❌ صار خطأ، جرب مرة ثانية من اللوحة.', components: [] });
      const channel = interaction.channels.first();
      store.setRoom(guild.id, state.key, state.label, channel.id);
      pending.delete(member.id);
      return interaction.update({
        content: `✅ تم إنشاء غرفة **${state.label}** (المفتاح: \`${state.key}\`)، روم الانتظار: <#${channel.id}>.`,
        components: [],
      });
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === 'pick_channel_for_done') {
      const channel = interaction.channels.first();
      store.setConfig(guild.id, { doneChannelId: channel.id });
      return interaction.update({
        content: `✅ تم تحديد <#${channel.id}> كروم الانتهاء. أي عضو يدخله بعد انتهاء خدمته بيوصله طلب تقييم بالخاص.`,
        components: [],
      });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'manage_menu') {
      const choice = interaction.values[0];

      if (choice === 'check_in') {
        const att = store.getAttendance(guild.id, member.id);
        if (att.checkedInAt) {
          return interaction.reply({ content: '⚠️ أنت مسجل دخول بالفعل.', ephemeral: true });
        }
        att.checkedInAt = Date.now();
        store.saveAttendance(guild.id, member.id, att);
        return interaction.reply({ content: '🟢 تم تسجيل الدخول. بدأت جلستك!', ephemeral: true });
      }

      if (choice === 'check_out') {
        const att = store.getAttendance(guild.id, member.id);
        if (!att.checkedInAt) {
          return interaction.reply({ content: '⚠️ أنت غير مسجل دخول.', ephemeral: true });
        }
        const elapsedMs = Date.now() - att.checkedInAt;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        const completedHours = Math.floor(elapsedSeconds / 3600);
        const cfg = store.getConfig(guild.id);
        const earnedPoints = completedHours * cfg.pointsPerHour;

        att.totalSeconds += elapsedSeconds;
        att.totalPoints += earnedPoints;
        att.checkedInAt = null;
        store.saveAttendance(guild.id, member.id, att);

        return interaction.reply({
          content: `🔴 تم تسجيل الخروج.\nمدة الجلسة: **${formatDuration(elapsedSeconds)}**\nالساعات المكتملة: **${completedHours}**\nالنقاط المكتسبة هذي الجلسة: **${earnedPoints}**\nإجمالي النقاط: **${att.totalPoints}**`,
          ephemeral: true,
        });
      }

      if (choice === 'my_hours') {
        const att = store.getAttendance(guild.id, member.id);
        let liveSeconds = att.totalSeconds;
        let statusLine = 'مسجل خروج ⚪';
        if (att.checkedInAt) {
          liveSeconds += Math.floor((Date.now() - att.checkedInAt) / 1000);
          statusLine = `مسجل دخول 🟢 (منذ <t:${Math.floor(att.checkedInAt / 1000)}:R>)`;
        }
        const embed = new EmbedBuilder()
          .setTitle(`ساعات ونقاط ${member.user.username}`)
          .setColor(0x3498DB)
          .addFields(
            { name: 'الحالة', value: statusLine },
            { name: 'إجمالي الوقت المسجل', value: formatDuration(liveSeconds), inline: true },
            { name: 'إجمالي النقاط', value: `${att.totalPoints}`, inline: true },
          );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (choice === 'leaderboard') {
        const all = store.getAllAttendance(guild.id);
        const rows = Object.entries(all)
          .map(([userId, data]) => ({ userId, points: data.totalPoints, seconds: data.totalSeconds }))
          .sort((a, b) => b.points - a.points)
          .slice(0, 10);
        if (rows.length === 0) {
          return interaction.reply({ content: 'لا يوجد بيانات حضور بعد.', ephemeral: true });
        }
        const lines = rows.map((r, i) => `**${i + 1}.** <@${r.userId}> — ${r.points} نقطة (${formatDuration(r.seconds)})`);
        const embed = new EmbedBuilder()
          .setTitle('🏆 قائمة المتصدرين بالنقاط')
          .setColor(0xF1C40F)
          .setDescription(lines.join('\n'));
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (choice === 'set_rate') {
        if (!isAdmin) return interaction.reply({ content: '❌ هذا الخيار للمشرفين فقط.', ephemeral: true });
        const cfg = store.getConfig(guild.id);
        const modal = new ModalBuilder()
          .setCustomId('modal_set_rate')
          .setTitle('تحديد معدل النقاط')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('rate').setLabel('عدد النقاط لكل ساعة كاملة')
                .setStyle(TextInputStyle.Short).setValue(String(cfg.pointsPerHour)).setRequired(true)
            ),
          );
        return interaction.showModal(modal);
      }

      if (choice === 'view_feedback') {
        if (!isAdmin) return interaction.reply({ content: '❌ هذا الخيار للمشرفين فقط.', ephemeral: true });
        const feedbackList = store.getFeedback(guild.id, 10);
        if (feedbackList.length === 0) {
          return interaction.reply({ content: 'لا يوجد تقييمات بعد.', ephemeral: true });
        }
        const lines = feedbackList.map(f => {
          const stars = '⭐'.repeat(f.rating);
          const note = f.feedback ? `\n> ${f.feedback}` : '';
          return `<@${f.userId}> — ${stars}${note}`;
        });
        const embed = new EmbedBuilder()
          .setTitle('📝 آخر التقييمات')
          .setColor(0x9B59B6)
          .setDescription(lines.join('\n\n'));
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_set_rate') {
      const raw = interaction.fields.getTextInputValue('rate').trim();
      const rate = Number(raw);
      if (Number.isNaN(rate) || rate < 0) {
        return interaction.reply({ content: '❌ الرجاء إدخال رقم صحيح غير سالب.', ephemeral: true });
      }
      store.setConfig(guild.id, { pointsPerHour: rate });
      return interaction.reply({ content: `✅ تم تحديد معدل النقاط بـ **${rate}** نقطة لكل ساعة كاملة.`, ephemeral: true });
    }

  } catch (err) {
    console.error(err);
    const payload = { content: '⚠️ صار خطأ غير متوقع.', embeds: [], components: [] };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
    } else if (interaction.isRepliable()) {
      await interaction.reply({ ...payload, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
