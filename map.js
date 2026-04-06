// Initialize the map (Centered on Sun Prairie, WI)
var map = L.map('map').setView([43.18, -89.21], 12);

// Load OpenStreetMap Tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

// Add the Search Bar (Wisconsin only)
var geocoder = L.Control.geocoder({
    defaultMarkGeocode: false,
    geocoder: L.Control.Geocoder.nominatim({
        geocodingQueryParams: {
            countrycodes: 'us',
            viewbox: '-92.889,47.080,-86.249,42.491', // WI bbox: west,north,east,south
            bounded: 1
        }
    })
})
.on('markgeocode', function(e) {
    var latlng = e.geocode.center;
    L.marker(latlng).addTo(map).bindPopup(e.geocode.name).openPopup();
    map.setView(latlng, 15);
})
.addTo(map);

// Load district plus school data with single combined layer control
Promise.all([
    fetch('districts.geojson').then(function(response) { return response.json(); }),
    fetch('schools.geojson').then(function(response) { return response.json(); }),
    fetch('schools_config.yaml').then(function(response) { return response.text(); }).then(function(yaml) { return jsyaml.load(yaml); })
])
.then(function(results) {
    var districtData = results[0];
    var schoolData = results[1];
    var config = results[2];

    var schoolColors = {};
    config.school.forEach(function(school) {
        schoolColors[school.schoolid] = school.primaryColor;
    });

    var overlays = {};

    // District layer
    var districtLayer = L.geoJSON(districtData, {
        style: function(feature) {
            var districtName = feature.properties.DISTRICT;
            if (districtName && districtName.toLowerCase().includes('sun prairie')) {
                return {
                    color: '#000000',
                    weight: 3,
                    fillColor: null
                };
            } else {
                return {
                    color: '#000',
                    weight: .5,
                    fillColor: '#000',
                    fillOpacity: 0.1
                };
            }
        },
        onEachFeature: function(feature, layer) {
            var name = feature.properties.DISTRICT + ' School District';
            layer.bindPopup('<strong>' + name + '</strong>');
        }
    }).addTo(map);

    overlays['School Districts'] = districtLayer;

    // School stage groups separated into points and polygons
    var stageGroups = {}; // stage -> {point: LayerGroup, polygon: LayerGroup}
    var schoolOverlays = {}; // individual school layers for separate control
    var schoolLayersById = {}; // schoolid -> { point, polygon }

    schoolData.features.forEach(function(feature, idx) {
        var stage = feature.properties.stage || 'Unknown';
        var schoolName = feature.properties.schoolname || 'Unnamed school ' + idx;
        var schoolid = feature.properties.schoolid || 'unknown-' + idx;

        if (!stageGroups[stage]) {
            stageGroups[stage] = {
                point: L.layerGroup(),
                polygon: L.layerGroup()
            };
        }

        var popupText = '<strong>' + schoolName + '</strong>';
        if (feature.properties.address) popupText += '<br />' + feature.properties.address;

        var fillColor = schoolColors[schoolid] || '#3399ff';

        if (feature.geometry && (feature.geometry.type === 'Point' || feature.geometry.type === 'MultiPoint')) {
            var pointLayer = L.geoJSON(feature, {
                pointToLayer: function(feature, latlng) {
                    return L.circleMarker(latlng, {
                        radius: 7,
                        color: '#004c99',
                        weight: 1,
                        fillColor: fillColor,
                        fillOpacity: 0.9
                    });
                },
                onEachFeature: function(feature, layer) {
                    layer.bindPopup(popupText);

                    layer.on('click', function() {
                        // Toggle the matching school polygon on/off
                        var matched = schoolLayersById[schoolid] && schoolLayersById[schoolid].polygon;
                        if (matched) {
                            if (map.hasLayer(matched)) {
                                map.removeLayer(matched);
                            } else {
                                map.addLayer(matched);
                                // Bring all points in the stage to front after adding polygon
                                Object.values(stageGroups[stage].point._layers).forEach(function(ptLayer) {
                                    if (ptLayer.bringToFront) ptLayer.bringToFront();
                                });
                                try {
                                    matched.setStyle({ weight: 3, color: '#ff7800' });
                                    setTimeout(function() {
                                        matched.setStyle({ weight: 1, color: '#0066cc' });
                                    }, 5000);
                                } catch (e) {
                                    // setStyle may not be supported on multi-layer objects; ignore gracefully
                                }
                            }
                        }
                    });
                }
            });

            stageGroups[stage].point.addLayer(pointLayer);
            schoolLayersById[schoolid] = schoolLayersById[schoolid] || {};
            schoolLayersById[schoolid].point = pointLayer;
            schoolOverlays[schoolName + ' (point)'] = pointLayer;

        } else if (feature.geometry && ['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
            var polygonLayer = L.geoJSON(feature, {
                style: {
                    color: '#0066cc',
                    weight: 1,
                    fillColor: fillColor,
                    fillOpacity: 0.35
                },
                onEachFeature: function(feature, layer) {
                    layer.bindPopup(popupText);
                }
            });

            stageGroups[stage].polygon.addLayer(polygonLayer);
            schoolLayersById[schoolid] = schoolLayersById[schoolid] || {};
            schoolLayersById[schoolid].polygon = polygonLayer;
            schoolOverlays[schoolName + ' (polygon)'] = polygonLayer;
        }
    });

    Object.keys(stageGroups).forEach(function(stage) {
        var combinedStage = L.layerGroup();
        combinedStage.addLayer(stageGroups[stage].polygon);
        combinedStage.addLayer(stageGroups[stage].point);

        stageGroups[stage].combined = combinedStage;
        combinedStage.addTo(map); // adds both points and polygons initially
        map.removeLayer(stageGroups[stage].polygon); // but remove polygons to start with them off

        overlays[stage] = combinedStage;
    });

    L.control.layers(null, overlays, { collapsed: false, position: 'topright' }).addTo(map);

})
.catch(function(err) {
    console.error('Failed to load district or school polygons:', err);
});
