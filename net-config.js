window.KIMI_NET_CONFIG = {
    debug: 1,
    config: {
        iceServers: [
            { urls: "stun:stun.relay.metered.ca:80" }
        ]
    }
};

// For stricter networks, copy net-config.example.js and add your own private TURN server.
// Do not publish real TURN usernames or credentials in a public static build.
