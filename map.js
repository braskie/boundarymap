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
    // Logic to check which boundary the point is in will go here later!
})
.addTo(map);

// Load district polygons and add to map
fetch('districts.geojson')
    .then(function(response) { return response.json(); })
    .then(function(data) {
        var districtLayer = L.geoJSON(data, {
            style: {
                color: '#ff0000',
                weight: 2,
                fillColor: '#ffcccc',
                fillOpacity: 0.3
            }
        }).addTo(map);
    });

// Load school polygons and add each as a separate overlay layer grouped by stage
fetch('schools.geojson')
    .then(function(response) { return response.json(); })
    .then(function(data) {
        var stageGroups = {}; // stage-based groups, e.g. Elementary/Middle/High

        data.features.forEach(function(feature, idx) {
            var stage = feature.properties.stage || 'Unknown';
            var schoolName = feature.properties.schoolname;

            var schoolLayer = L.geoJSON(feature, {
                style: {
                    color: '#0066cc',
                    weight: 1,
                    fillColor: '#3399ff',
                    fillOpacity: 0.35
                },
                onEachFeature: function(feature, layer) {
                    var popup = [];
                    popup.push('<strong>' + schoolName + '</strong>');
                    if (feature.properties.address) popup.push(feature.properties.address);
                    if (popup.length) layer.bindPopup(popup.join('<br />'));
                }
            });

            if (!stageGroups[stage]) {
                stageGroups[stage] = L.layerGroup();
            }
            stageGroups[stage].addLayer(schoolLayer);
        });

        // Option 1: show all stage groups initially
        Object.values(stageGroups).forEach(function(group) {
            group.addTo(map);
        });

        // Add stage groups to layer control
        L.control.layers(null, stageGroups, { collapsed: false, position: 'topright' }).addTo(map);
    })
    .catch(function(err) {
        console.error('Failed to load school polygons:', err);
    });
