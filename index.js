const express = require("express");
const axios = require("axios");
const cors = require("cors");
const HASH_TOKEN = require("./token");

const app = express();
app.use(cors());
app.use(express.json());

const API_URL = "https://api.iq.inrix.com";
//merge into the main with the server branch, pull from different places like main to get those changes(switch to the main branch(you can merge with main as a result and then people can pull from main))

app.get("/", (req, res) => {
  res.json("the backend is working");
});

app.get("/getData", async (req, res) => {
  try {
    const { location, destination } = req.query;
    const data1 = await axios.get(
      `https://api.iq.inrix.com/auth/v1/appToken?appId=7ezmr8fgj2&hashToken=${HASH_TOKEN}`
    );

    let output = data1.data.result.token;

    // //get total distance
    const data = await axios.get(
      `${API_URL}/findRoute?wp_1=${location.split(",")[0]}%2C${
        location.split(",")[1]
      }&wp_2=${destination.split(",")[0]}%2C${
        destination.split(",")[1]
      }&maxAlternates=2&useTraffic=true&format=json`,
      {
        headers: {
          Authorization: `Bearer ${output}`,
          "Content-Type": "application/json",
        },
      }
    );

    const minTime = getMinTime(data.data.result.trip.routes);
    const fixedData = data.data.result.trip.routes.map((el) => {
      const fuelRes = fuelScore({
        averageSpeed: el.averageSpeed,
        roads: el.summary.roads,
      });
      const speedRes = speedScore({
        minimumTime: minTime,
        travelTime: el.travelTimeMinutes,
      });
      const roadRes = getRoadScore(el.summary.roads);
      const ecoRes = ecoScore(fuelRes, speedRes, roadRes);
      const [locLat, locLng] = location.split(",");
      const [destLat, destLng] = destination.split(",");
      const coords = Object.values(el.boundingBox).map((el) => [
        ...el.coordinates[0],
      ]);
      const coordinates = [[locLng, locLat], ...coords, [destLng, destLat]];
      return {
        ecoScore: ecoRes,
        speedScore: speedRes,
        roadScore: roadRes,
        fuelScore: fuelRes,
        name: el.summary.text,
        distance: el.totalDistance,
        time: el.travelTimeMinutes,
        coordinates,
      };
    });

    res.status(200).json({ status: "success", data: { ...fixedData } });

    // res.json(newData)
  } catch (err) {
    console.log(err.message);
  }
});

app.get("/", (req, res) => {
  res.json("Backend currently working");
});

//git merge server makes the branch selected to the data

PORT = 8000;
app.listen(PORT, () => console.log("hello"));

function mpg(speed, roadScore) {
  let a = 5.15436,
    b = 1.2836,
    c = -0.0190454,
    d = 0.0000689626; // regression from desmos
  let result = a + b * speed + c * speed ** 2 + d * speed ** 3;
  // speed_buckets = [1, 1, 1, 1]

  result *= 1.1 - (roadScore - 20) / 800;
  return result;
}
function fuelScore(data) {
  const avgSpeed = data.averageSpeed;
  const fuelResult = (mpg(avgSpeed, getRoadScore(data.roads)) / 35) * 100;
  return fuelResult;
}

function getMinTime(routes) {
  if (routes.length == 3)
    return Math.min(
      routes[0]?.uncongestedTravelTimeMinutes || 1,
      routes[1]?.uncongestedTravelTimeMinutes || 1,
      routes[2]?.uncongestedTravelTimeMinutes || 1
    );
  if (routes.length == 2)
    return Math.min(
      routes[0]?.uncongestedTravelTimeMinutes || 1,
      routes[1]?.uncongestedTravelTimeMinutes || 1
    );
  return routes[0]?.uncongestedTravelTimeMinutes || 1;
}

function speedScore(data) {
  const { minimumTime, travelTime } = data;
  return Math.min(1, minimumTime / travelTime) * 100;
}

function getRoadScore(data) {
  const roads = data;
  const roadScore = {
    1: 1,
    2: 0.8,
    3: 0.6,
    4: 0.4,
    5: 0.2,
  };
  const roadsMeasured = roads.map((el) => ({
    ...el,
    roadQuality: roadScore[el.roadClass],
  }));

  const roadScoreSum = roadsMeasured.reduce(
    (cur, el) => cur + el.roadQuality,
    0
  );

  const finalRoadScore = roadScoreSum / roads.length;
  return finalRoadScore * 100;
}

function ecoScore(fuelScore, speedScore, roadScore) {
  return (fuelScore + speedScore + roadScore) / 3;
}
