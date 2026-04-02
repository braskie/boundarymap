// Initialize the map (Centered on Sun Prairie, WI)
var map = L.map('map').setView([43.18, -89.21], 12);

// School color mapping by school name
var schoolColors = {
    "C.H. Bird": "#2C3482",
    "Creekside": "#085465",
    "Eastside": "#2C3482",
    "Horizon": "#6F0000",
    "Meadow View": "#088093",
    "Northside": "#00005B",
    "Royal Oaks": "#C20202",
    "Token Springs": "#25476A",
    "Westside": "#035717",
    "Central Heights": "#025157",
    "Patrick Marsh": "#2C3482",
    "Prairie View": "#6F0000",
    "Sun Prairie East": "#D12027",
    "Sun Prairie West": "#112644",
    "Prairie Phoenix Academy": "#0B522C"
    // Add more school names and colors as needed
};

// Load OpenStreetMap Tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

// Add the Search Bar
var geocoder = L.Control.geocoder({
    defaultMarkGeocode: false
})
.on('markgeocode', function(e) {
    var latlng = e.geocode.center;
    L.marker(latlng).addTo(map).bindPopup(e.geocode.name).openPopup();
    map.setView(latlng, 15);
    // Logic to check which boundary the point is in will go here later!
})
.addTo(map);

// Load school district boundaries
fetch('districts.geojson')
.then(response => response.json())
.then(data => {
    var schoolDistricts = L.geoJSON(data, {
        style: function(feature) {
            if (feature.properties.DISTRICT === 'Sun Prairie Area') {
                return {color: 'black', weight: 1, fill: false};
            } else {
                return {color: 'black', weight: 1, fillColor: 'lightblue', fillOpacity: 0.3};
            }
        },
        onEachFeature: function(feature, layer) {
            layer.bindPopup('District: ' + feature.properties.DISTRICT);
        }
    });

    // Load schools
    fetch('schools.geojson')
    .then(response => response.json())
    .then(schoolsData => {
        function getDistrict(schoolFeature, districtsData) {
            for (var district of districtsData.features) {
                if (turf.booleanWithin(schoolFeature, district)) {
                    return district.properties.DISTRICT;
                }
            }
            return "Unknown";
        }

        var elementarySchools = L.geoJSON(schoolsData, {
            filter: function(feature) { return feature.properties.Type === 'Elementary'; },
            style: function(feature) {
                return {
                    color: schoolColors[feature.properties.School] || 'red',
                    weight: 2,
                    opacity: 0.5,
                    fillOpacity: 0.5
                };
            }
        });

        var middleSchools = L.geoJSON(schoolsData, {
            filter: function(feature) { return feature.properties.Type === 'Middle'; },
            style: function(feature) {
                return {
                    color: schoolColors[feature.properties.School] || 'blue',
                    weight: 2,
                    opacity: 0.5,
                    fillOpacity: 0.5
                };
            }
        });

        var highSchools = L.geoJSON(schoolsData, {
            filter: function(feature) { return feature.properties.Type === 'High'; },
            style: function(feature) {
                return {
                    color: schoolColors[feature.properties.School] || 'green',
                    weight: 2,
                    opacity: 0.5,
                    fillOpacity: 0.5
                };
            }
        });

        var overlays = {
            "School Districts": schoolDistricts,
            "Elementary Schools": elementarySchools,
            "Middle Schools": middleSchools,
            "High Schools": highSchools
        };
        L.control.layers(null, overlays).addTo(map);

        elementarySchools.addTo(map);
        middleSchools.addTo(map);
        highSchools.addTo(map);

        map.on('click', function(e) {
            var clickedPoint = turf.point([e.latlng.lng, e.latlng.lat]);
            var containingSchools = [];
            schoolsData.features.forEach(function(feature) {
                if (turf.booleanPointInPolygon(clickedPoint, feature)) {
                    var district = getDistrict(feature, data);
                    containingSchools.push({
                        type: feature.properties.Type,
                        school: feature.properties.School,
                        district: district
                    });
                }
            });
            if (containingSchools.length > 0) {
                var popupContent = containingSchools.map(function(school) {
                    return school.school;
                }).join('<br>');
                L.popup()
                    .setLatLng(e.latlng)
                    .setContent(popupContent)
                    .openOn(map);
            }
        });
    });
});
