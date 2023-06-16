require([
  "esri/Map",
  "esri/views/SceneView",
  "esri/layers/GraphicsLayer",
  "esri/layers/FeatureLayer",
  "esri/Graphic",
  "esri/request",
  "esri/widgets/Popup",
  "esri/widgets/Slider"
], (Map, SceneView, GraphicsLayer, FeatureLayer, Graphic, esriRequest, Popup, Slider) => {
  const map = new Map({
    basemap: "satellite"
  });

  const view = new SceneView({
    container: "viewDiv",
    map: map,
    camera: {
      position: [
        -94, // x
        45, // y 
        150000000  // z (meters)
      ]
    },
    constraints: {
      altitude: {
        min: 5000000, // meters
        max: 500000000 // meters
      }
    },
    // force the popup to the docked position
    // for each selected feature
    popup: new Popup({
      dockEnabled: true,
      dockOptions: {
        breakpoint: false
      }
    }),
    environment: {
      lighting: {
        type: "virtual"
      },
      starsEnabled: false,
      atmosphereEnabled: false
    }
  });

  view.popup.watch("selectedFeature", () => {
    satelliteTracks.removeAll();
  });

  view.popup.on("trigger-action", (event) => {
    if (event.action.id === "track") {
      satelliteTracks.removeAll();

      let graphic = view.popup.selectedFeature;
      let trackFeatures = [];

      for (let i = 0; i < 60 * 24; i++) {
        let loc;
        try {
          loc = getSatelliteLocation(
            new Date(graphic.attributes.obsTime + i * 1000 * 60),
            graphic.attributes.line1,
            graphic.attributes.line2
          );
        } catch (error) { }

        if (loc) {
          trackFeatures.push([loc.x, loc.y, loc.z]);
        }
      }

      let track = new Graphic({
        geometry: {
          type: "polyline", // autocasts as new Polyline()
          paths: [trackFeatures]
        },
        symbol: {
          type: "line-3d", // autocasts as new LineSymbol3D()
          symbolLayers: [
            {
              type: "line", // autocasts as new LineSymbol3DLayer()
              material: {
                color: [255, 255, 255, 0.5]
              },
              size: 1.5
            }
          ]
        }
      });

      satelliteTracks.add(track);
    }
  });

  const satelliteLayer = new FeatureLayer({
    // create an instance of esri/layers/support/Field for each field object
    fields: [
      {
        name: "ObjectID",
        alias: "ObjectID",
        type: "oid"
      },
      {
        name: "commonName",
        alias: "Name",
        type: "string"
      },
      {
        name: "launchYear",
        alias: "Launch Year",
        type: "long"
      },
      {
        name: "launchNum",
        alias: "Launch Number",
        type: "long"
      },
      {
        name: "line1",
        alias: "TLE Line 1",
        type: "string",
        length: 100
      },
      {
        name: "line2",
        alias: "TLE Line 2",
        type: "string",
        length: 100
      },
      {
        name: "obsTime",
        alias: "Observation Time",
        type: "long"
      }
    ],
    objectIdField: "ObjectID",
    geometryType: "point",
    hasZ: true,
    spatialReference: { wkid: 4326 },
    source: [],  // Initialize with no features
    popupTemplate: {
      // autocasts as new PopupTemplate()
      title: "{commonName}",
      content: [
        {
          type: "fields",
          fieldInfos: [
            {
              fieldName: "ObjectId"
            }, {
              fieldName: "commonName"
            }, {
              fieldName: "launchYear"
            }, {
              fieldName: "launchNum"
            }, {
              fieldName: "line1"
            }, {
              fieldName: "line2"
            }, {
              fieldName: "obsTime"
            }
          ]
        }
      ],
      actions: [
        {
          // Create a popup action to display the satellite track.
          title: "Show 24-Hour Satellite Track",
          id: "track",
          className: "esri-icon-globe"
        }
      ]
    },
    renderer: {
      type: "simple",
      symbol: {
        type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
        color: [0, 255, 0, 0.5],
        outline: null,
        size: 1.5
      }
    }
  });

  const satelliteTracks = new GraphicsLayer();

  map.addMany([satelliteLayer, satelliteTracks]);

  // Create satellite slider and add to map
  const slider = new Slider({
    container: "sliderDiv",
    min: 0,
    max: 0,
    steps: 500,
    values: [0],
    layout: "horizontal",
    disabled: true,
    snapOnClickEnabled: false,
    visibleElements: {
      labels: true,
      rangeLabels: true
    }
  });

  view.ui.add("infoDiv", { position: "bottom-left" });
  slider.on(
    ["thumb-drag", "thumb-change", "segment-drag"],
    updateSatelliteFilter
  );

  // request the satallite data from hosted site
  let url =
    //"https://developers.arcgis.com/javascript/latest/sample-code/satellites-3d/live/brightest.txt";  // Small sample of satellite TLE data
    //"http://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";  // All active satellites TLE data
    //"https://www.space-track.org/basicspacedata/query/class/gp/EPOCH/%3Enow-30/orderby/NORAD_CAT_ID,EPOCH/format/3le";  // Complete dataset -- account required
    "./all.txt";  // Local copy of CelesTrak TLE data

  esriRequest(url, {
    responseType: "text"
  }).then(function (response) {
    // The requested data
    const txt = response.data;

    // Parse the satellite TLE data
    const lines = txt.split("\n");
    const count = (lines.length / 3).toFixed(0);
    const time = Date.now();
    const now = new Date(time);
    const satGraphics = [];

    for (let i = 0; i < count; i++) {
      let commonName = lines[i * 3 + 0].trim();
      let line1 = lines[i * 3 + 1].trim();
      let line2 = lines[i * 3 + 2].trim();

      /*************************************************
       * Create attributes for the International
       * designator and Norad identifier. See the
       * doc for details.
       * https://www.space-track.org/documentation#/tle
       *************************************************/

      let satelliteLoc;
      try {
        satelliteLoc = getSatelliteLocation(now, line1, line2);
      } catch (error) { }

      if (satelliteLoc) {
        const designator = line1.substring(9, 16);
        const launchYear = designator.substring(0, 2);
        const fullLaunchYear = Number(launchYear) >= 57
          ? Number(`19${launchYear}`)
          : Number(`20${launchYear}`);
        const launchNum = Number(designator.substring(2, 5));

        let graphic = new Graphic({
          geometry: satelliteLoc,
          attributes: {
            commonName: commonName,
            launchYear: fullLaunchYear,
            launchNum: launchNum,
            line1: line1,
            line2: line2,
            obsTime: time
          }
        });
        satGraphics.push(graphic);
      }
    };
    satelliteLayer.applyEdits({ addFeatures: satGraphics }).then(slider.disabled = false);
    slider.max = satGraphics.length;
    slider.values = [satGraphics.length];
  });

  // Update satellite filter based on slider
  let satelliteView;

  // Update satellite filter on layer load
  view.whenLayerView(satelliteLayer).then(layerView => {
    satelliteView = layerView;
    updateSatelliteFilter();
  });

  function updateSatelliteFilter () {
    console.log(`Displaying ${slider.values[0]} satellites`);
    satelliteView.filter = {
      where: `ObjectId < ${slider.values[0]}`
    };
  };

  function getSatelliteLocation (date, line1, line2) {
    /****************************************************
     * satellite-js is a library that includes a set of
     * functions to convert TLE to geographic locations
     * We use this to get the geographic location of the
     * satellites for the current date. For more details
     * on satellite-js visib the github repo
     * https://github.com/shashwatak/satellite-js
     ****************************************************/
    const satrec = satellite.twoline2satrec(line1, line2);
    const position_and_velocity = satellite.propagate(
      satrec,
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds()
    );
    const position_eci = position_and_velocity.position;

    const gmst = satellite.gstime_from_date(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds()
    );

    const position_gd = satellite.eci_to_geodetic(position_eci, gmst);

    let longitude = position_gd.longitude;
    let latitude = position_gd.latitude;
    let height = position_gd.height;
    if (isNaN(longitude) || isNaN(latitude) || isNaN(height)) {
      return null;
    }
    const rad2deg = 180 / Math.PI;
    while (longitude < -Math.PI) {
      longitude += 2 * Math.PI;
    }
    while (longitude > Math.PI) {
      longitude -= 2 * Math.PI;
    }
    return {
      type: "point", // Autocasts as new Point()
      x: rad2deg * longitude,
      y: rad2deg * latitude,
      z: height * 1000
    };
  }
});