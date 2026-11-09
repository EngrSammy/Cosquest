/**
 * Mark a group as REGIONAL (made by orchestrators, e.g. "SoCal Ascendants")
 * or back to LOCAL. Until orchestrators get their own screen, run this from
 * the backend folder:
 *
 *   node scripts/setGroupScope.js "SoCal Ascendants" regional
 *   node scripts/setGroupScope.js <groupId> local
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../src/config/db');
const Conversation = require('../src/models/Conversation');

async function main() {
  const [target, scope] = process.argv.slice(2);
  if (!target || !['local', 'regional'].includes(scope)) {
    console.log('Usage: node scripts/setGroupScope.js "<group name or id>" regional|local');
    process.exitCode = 1;
    return;
  }
  await connectDB();
  try {
    const query = mongoose.isValidObjectId(target)
      ? { _id: target, type: 'group' }
      : { type: 'group', 'group.name': target };
    const groups = await Conversation.find(query).limit(5);
    if (groups.length !== 1) {
      console.error(groups.length ? `${groups.length} groups have that name - use the group id instead.` : 'No group found.');
      process.exitCode = 1;
      return;
    }
    groups[0].group.scope = scope;
    groups[0].markModified('group');
    await groups[0].save();
    console.log(`"${groups[0].group.name}" is now ${scope}.`);
  } finally {
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
