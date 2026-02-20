module.exports = {
    name: "guildEmojiUpdate",
    async execute(oldEmoji, newEmoji) {
        const { guild } = newEmoji;
        if (oldEmoji.name === newEmoji.name) return; 

    }
};