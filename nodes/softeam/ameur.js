module.exports = function (RED) {
    function MyCustomNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.on('input', function (msg) {
            msg.payload = "Hello from my custom node!";
            node.send(msg);
        });
    }
    RED.nodes.registerType("ameur", MyCustomNode, {
        category: "aiOP", // Nouvelle catégorie
        color: "#a6bbcf",
        defaults: {
            name: { value: "" }
        },
        inputs: 1,
        outputs: 1,
        icon: "file.png",
        label: function () {
            return this.name || "My Custom Node";
        }
    });
};
