require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// أسماء الأوامر تبقى إنجليزية (متطلبات ديسكورد للأوامر السلاش)، والوصف عربي
const commands = [
  new SlashCommandBuilder()
    .setName('support')
    .setDescription('نشر لوحة تحكم توجيه الدعم الثابتة في هذا الروم'),

  new SlashCommandBuilder()
    .setName('manage-support')
    .setDescription('(للمشرفين) نشر لوحة إدارة الفريق الثابتة (تسجيل دخول/خروج، نقاط) في هذا الروم')
    .setDefaultMemberPermissions(0),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('⏳ جاري تسجيل الأوامر...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );
    console.log('✅ تم تسجيل الأوامر: /support و /manage-support');
  } catch (err) {
    console.error(err);
  }
})();
