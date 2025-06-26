const axios = require('axios');

module.exports = function(RED) {
  function GrafanaSendNode(config) {
    RED.nodes.createNode(this, config);
    
    const node = this;
    
    // Configuration du nœud
    node.grafanaUrl = config.grafanaUrl;
    node.apiToken = config.apiToken;
    node.datasourceName = config.datasourceName;
    node.measurement = config.measurement || "measurement";
    
    node.on('input', async function(msg) {
      try {
        // Validation des paramètres
        if (!node.grafanaUrl || !node.apiToken) {
          node.error("URL Grafana et token API requis");
          return;
        }
        
        // Préparer les données selon le format InfluxDB
        let data;
        
        if (msg.payload && typeof msg.payload === 'object') {
          // Si payload est un objet, convertir en format InfluxDB line protocol
          const fields = Object.entries(msg.payload)
          .map(([key, value]) => `${key}=${typeof value === 'string' ? `"${value}"` : value}`)
          .join(',');
          
          data = `${node.measurement} ${fields} ${Date.now() * 1000000}`;
        } else {
          // Format simple pour une valeur unique
          data = `${node.measurement} value=${typeof msg.payload === 'string' ? `"${msg.payload}"` : msg.payload} ${Date.now() * 1000000}`;
        }
        console.log('-----',`${node.grafanaUrl}/api/datasources/proxy/uid/${node.datasourceName}/write?db=telegraf`)
        console.log("****",data)
        console.log( {
          headers: {
            'Authorization': `Bearer ${node.apiToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
        // Envoyer les données à Grafana via InfluxDB
        const response = await axios.post(
          `${node.grafanaUrl}/api/datasources/proxy/uid/${node.datasourceName}/write?db=telegraf`,
          data,
          {
            headers: {
              'Authorization': `Bearer ${node.apiToken}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );
     
        node.status({fill: "green", shape: "dot", text: "Données envoyées"});
        
        // Transmettre le message avec les informations de réponse
        msg.grafanaResponse = {
          status: response.status,
          statusText: response.statusText,
          timestamp: new Date().toISOString()
        };
        
        node.send(msg);
        
        // Effacer le status après 3 secondes
        setTimeout(() => {
          node.status({});
        }, 3000);
        
      } catch (error) {
        node.error(`Erreur envoi Grafana: ${error.message}`, msg);
        node.status({fill: "red", shape: "ring", text: "Erreur"});
        
        setTimeout(() => {
          node.status({});
        }, 5000);
      }
    });
    
    node.on('close', function() {
      // Nettoyage si nécessaire
    });
  }
  
  RED.nodes.registerType("grafana-send", GrafanaSendNode);
};