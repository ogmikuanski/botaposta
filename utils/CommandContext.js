const { Message, ChatInputCommandInteraction } = require("discord.js");

class CommandContext {
    /**
     * @param {Message | ChatInputCommandInteraction} source 
     * @param {object} options 
     */
    constructor(source, options = {}) {
        this.source = source;
        this.isSlash = source instanceof ChatInputCommandInteraction;
        this.args = options.args || [];
        this.client = source.client;
    }

    get guild() { return this.source.guild; }
    get channel() { return this.source.channel; }
    get user() { return this.isSlash ? this.source.user : this.source.author; }
    get member() { return this.source.member; }

    async reply(payload, ephemeral = false) {
        if (this.isSlash) {
            if (this.source.deferred) {
                return await this.source.editReply(payload);
            }
            if (this.source.replied) {
                return await this.source.followUp({ ...this.parsePayload(payload), ephemeral });
            }
            return await this.source.reply({ ...this.parsePayload(payload), ephemeral });
        } else {
            const msg = await this.source.reply(payload);
            return msg;
        }
    }

    parsePayload(payload) {
        return typeof payload === 'string' ? { content: payload } : payload;
    }

    async replyKZ(payload, timeMs = 5000) {
        let msg;
        try {
            msg = await this.reply(payload);
            
            if (!this.isSlash) {
                setTimeout(() => msg.delete().catch(() => {}), timeMs);
            } else if (!payload.ephemeral) {
                 setTimeout(() => this.source.deleteReply().catch(() => {}), timeMs);
            }
        } catch (e) {
        }
    }
}

module.exports = CommandContext;