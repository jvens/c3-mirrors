import { WebSocket } from 'ws';
import mqtt from 'mqtt';

const config = {
  ftcLiveIP: 'localhost',
  ftcLivePort: 18080,
  ftcLiveEvent: ['test3'],
  mqttBroker: 'mqtt://localhost:1883',
  mqttTopic: 'test',
}

async function TestConnection() {
  const response = await fetch(`http://${config.ftcLiveIP}:${config.ftcLivePort}/api/v1/version/`);
  const data = await response.json();
  console.log(`API Version: ${data.version}`);

  for (const event of config.ftcLiveEvent) {
    const response2 = await fetch(`http://${config.ftcLiveIP}:${config.ftcLivePort}/api/v1/events/${config.ftcLiveEvent}/`);
    const data2 = await response2.json();
    console.log(`Event Name: ${data2.name}`);
  }
  return true;
}

async function connectWebSocket(eventCode: string, cloud: mqtt.MqttClient) {
  const ws = new WebSocket(`ws://${config.ftcLiveIP}:${config.ftcLivePort}/api/v2/stream/?code=${eventCode}`);
  ws.onopen = () => {
    console.log('WebSocket Open');
  };
  ws.onmessage = async (event) => {
    if (typeof event.data === 'string' && event.data === 'pong') {
      return;
    }
    const message = JSON.parse(event.data.toString());
    console.log('WebSocket Message: ', message);
    const number = message.payload?.number;
    const updateType = message.updateType;
    console.log('Match Number:', number);
    console.log('Update Type:', updateType);
    if (updateType === 'MATCH_POST') {
      const matchInfo = await fetch(`http://${config.ftcLiveIP}:${config.ftcLivePort}/api/v1/events/${eventCode}/matches/${number}/`);
      const matchData = await matchInfo.json();
      //console.log('Match Data:', matchData);
      const teamData = {
        matchNumber: matchData.matchNumber,
        redScore: matchData.redScore,
        blueScore: matchData.blueScore,
        red1: matchData.red?.robot1,
        red2: matchData.red?.robot2,
        red3: matchData.red?.robot3,
        blue1: matchData.blue?.robot1,
        blue2: matchData.blue?.robot2,
        blue3: matchData.blue?.robot3,
      }
      // I assume at this point you would do something like this:
      let redMessage = 'tie' as 'win' | 'loss' | 'tie';
      let blueMessage = 'tie' as 'win' | 'loss' | 'tie';
      if (teamData.redScore > teamData.blueScore) {
        redMessage = 'win';
        blueMessage = 'loss';
      } else if (teamData.blueScore > teamData.redScore) {
        redMessage = 'loss';
        blueMessage = 'win';
      }

      // For each team, publish the message to the MQTT broker if the team won, lost, or tied
      if (teamData.red1) {
        cloud.publish(`team/${teamData.red1}`, redMessage);
      }
      if (teamData.red2) {
        cloud.publish(`team/${teamData.red2}`, redMessage);
      }
      if (teamData.red3) {
        cloud.publish(`team/${teamData.red3}`, redMessage);
      }
      if (teamData.blue1) {
        cloud.publish(`team/${teamData.blue1}`, blueMessage);
      }
      if (teamData.blue2) {
        cloud.publish(`team/${teamData.blue2}`, blueMessage);
      }
      if (teamData.blue3) {
        cloud.publish(`team/${teamData.blue3}`, blueMessage);
      }
    }
  };
  ws.onclose = () => {
    console.log('WebSocket Close');
  };
  ws.onerror = (err) => {
    console.error('WebSocket Error', err);
  };
}

async function connectMQTT() {
  const client = mqtt.connect(config.mqttBroker);
  client.on('connect', () => {
    console.log('MQTT Connected');
    client.subscribe(config.mqttTopic, (err) => {
      if (err) {
        console.error('MQTT Subscribe Error', err);
      }
    });
  });
  client.on('message', (topic, message) => {
    console.log('MQTT Message', topic, message.toString());
  });
  client.on('error', (err) => {
    console.error('MQTT Error', err);
  });
  return client;
}


async function runSystem() {
  try {
    console.log('Running System');
    await TestConnection();
    const cloud = await connectMQTT();
    for (const event of config.ftcLiveEvent) {
      await connectWebSocket(event, cloud);
    }
    console.log('System Running');
  } catch (err: any) {
    console.error(err?.message || 'Unknown Error');
  }
}

runSystem();
