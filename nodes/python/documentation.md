# Node-RED Grafana Connector

Module Node-RED pour intégrer facilement Grafana avec Node-RED. Permet d'envoyer des données vers Grafana et de recevoir des notifications/alertes depuis Grafana.

## Installation

```bash
npm install node-red-contrib-grafana-connector
```

Ou via l'interface Node-RED :
1. Menu → Manage palette
2. Install → Rechercher "node-red-contrib-grafana-connector"
3. Install

## Nœuds disponibles

### 🔄 Grafana Send
Envoie des données vers une datasource Grafana (InfluxDB).

**Configuration :**
- **URL Grafana** : URL de votre instance Grafana (ex: `http://localhost:3000`)
- **Token API** : Token d'API Grafana avec permissions d'écriture
- **Datasource UID** : UID de la datasource InfluxDB dans Grafana
- **Measurement** : Nom de la mesure InfluxDB (défaut: `sensor_data`)

**Utilisation :**
```javascript
// Valeur simple
msg.payload = 25.6;

// Plusieurs valeurs
msg.payload = {
    temperature: 25.6,
    humidity: 65.2,
    location: "salon"
};
```

### 📨 Grafana Receive
Reçoit des notifications et alertes depuis Grafana via webhook.

**Configuration :**
- **Port** : Port d'écoute (généralement 1880)
- **Chemin** : Chemin webhook (ex: `/grafana-webhook`)

**URL Webhook** : `http://votre-ip:1880/grafana-webhook`

## Configuration Grafana

### 1. Créer un Token API
1. Grafana → Administration → Service accounts
2. Add service account → Nom : "NodeRED"
3. Add service account token → Copier le token

### 2. Configurer InfluxDB (pour Send)
1. Grafana → Data sources → Add data source → InfluxDB
2. Noter l'UID de la datasource (visible dans l'URL)

### 3. Configurer Contact Point (pour Receive)
1. Grafana → Alerting → Contact points → New contact point
2. **Name** : NodeRED
3. **Integration** : Webhook
4. **URL** : `http://votre-ip:1880/grafana-webhook`
5. **HTTP Method** : POST

## Exemples d'utilisation

### Scénario 1 : Dashboard → Node-RED
Dashboard Grafana envoie des données toutes les 10 minutes vers Node-RED.

### Scénario 2 : HTTP → Grafana
Node-RED reçoit HTTP POST `{value: 10}` et l'envoie vers Grafana.

## Structure du projet

```
node-red-contrib-grafana-connector/
├── package.json
├── README.md
├── nodes/
│   ├── grafana-send.js
│   ├── grafana-send.html
│   ├── grafana-receive.js
│   └── grafana-receive.html
└── examples/
    ├── grafana-dashboard.json
    └── nodered-flow.json
```

## Exemples complets

Les fichiers d'exemple incluent :
- **Dashboard Grafana** : Configuration complète avec thème météo
- **Flux Node-RED** : Exemples d'intégration et de test

## Dépannage

### Erreurs communes

**"Token API invalide"**
- Vérifiez que le token a les bonnes permissions
- Le token doit être préfixé par `glsa_`

**"Datasource introuvable"**
- Vérifiez l'UID de la datasource dans Grafana
- Assurez-vous que la datasource est active

**"Webhook non reçu"**
- Vérifiez l'URL et le port
- Testez avec curl : `curl -X POST http://localhost:1880/grafana-webhook -d '{"test":"value"}'`

### Logging

Activez les logs détaillés dans Node-RED :
```bash
node-red --verbose
```

## Contribution

1. Fork le projet
2. Créer une branche feature
3. Commit vos changements
4. Push vers la branche
5. Créer une Pull Request

## Licence

MIT

## Support

- Issues : [GitHub Issues](https://github.com/votre-username/node-red-contrib-grafana-connector/issues)
- Documentation : [Wiki](https://github.com/votre-username/node-red-contrib-grafana-connector/wiki)