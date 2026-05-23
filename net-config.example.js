window.KIMI_NET_CONFIG = {
    debug: 1,
    config: {
        iceServers: [
            { urls: "stun:stun.relay.metered.ca:80" },
            {
                urls: "turn:your-turn.example.com:3478",
                username: "replace-with-temporary-username",
                credential: "replace-with-temporary-password"
            },
            {
                urls: "turns:your-turn.example.com:5349?transport=tcp",
                username: "replace-with-temporary-username",
                credential: "replace-with-temporary-password"
            }
        ]
    }
};

