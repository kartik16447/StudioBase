
function testEnvelope(session) {
    const { events: rawEvents, ...sessionWithoutEvents } = session;
    const finalEnvelope = {
        // Only include raw events if there are no pre-processed steps (legacy sessions only)
        ...((!session.steps || session.steps.length === 0) ? { events: rawEvents } : {}),
        ...sessionWithoutEvents,
        screenshots: [],
        videoKey: null,
    };
    return finalEnvelope;
}

const modernSession = {
    sessionId: "modern-123",
    events: [{ type: "click" }],
    steps: [{ id: "step-1" }]
};

const legacySession = {
    sessionId: "legacy-123",
    events: [{ type: "click" }],
    steps: []
};

const missingStepsSession = {
    sessionId: "missing-123",
    events: [{ type: "click" }]
};

console.log("Modern Session:", JSON.stringify(testEnvelope(modernSession), null, 2));
console.log("Legacy Session (empty steps):", JSON.stringify(testEnvelope(legacySession), null, 2));
console.log("Legacy Session (missing steps):", JSON.stringify(testEnvelope(missingStepsSession), null, 2));
