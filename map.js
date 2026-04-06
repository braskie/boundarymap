// ===== Map + global constants =====
const map = L.map('map').setView([43.18, -89.21], 12);
const WI_VIEWBOX = '-92.889,47.080,-86.249,42.491';
const STAGE_ORDER = ['High', 'Middle', 'Elementary'];
const DEFAULT_POINT_COLOR = '#1f78b4';
const SEARCH_ZOOM = 14;

function stageRank(stage) {
    const idx = STAGE_ORDER.indexOf(stage);
    return idx === -1 ? STAGE_ORDER.length : idx;
}

function compareStages(a, b) {
    const rankDiff = stageRank(a) - stageRank(b);
    if (rankDiff !== 0) return rankDiff;
    return String(a || '').localeCompare(String(b || ''));
}

// ===== Shared runtime state =====
let schoolBoundaryFeatures = [];
let schoolPointsById = {};           // schoolid (string) -> { latlng, color }
let boundaryById = {};               // schoolid (string) -> boundary member
let districtFeatures = [];           // district polygons for lookup
let activeAddressBoundaryIds = [];   // school ids auto-activated by last lookup
const activeAddressGroup = L.layerGroup(); // cleared on each new lookup

// ===== Address info control (bottom-right) =====
const addressInfoControl = L.control({ position: 'bottomright' });
addressInfoControl.onAdd = function () {
    const div = L.DomUtil.create('div');
    div.style.cssText = 'background:#fff;padding:10px 14px;border:1px solid #bbb;' +
        'border-radius:4px;min-width:200px;max-width:280px;font-size:13px;display:none;';
    L.DomEvent.disableClickPropagation(div);
    this._div = div;
    return div;
};
addressInfoControl.reset = function () {
    clearAutoActivatedBoundaries();
    activeAddressGroup.clearLayers();
    this._div.innerHTML = '';
    this._div.style.display = 'none';
};
addressInfoControl.update = function (html) {
    if (!html) { this._div.style.display = 'none'; return; }
    const self = this;
    const closeBtn = '<button title="Close" style="float:right;margin-left:8px;background:none;' +
        'border:none;font-size:14px;line-height:1;cursor:pointer;padding:0;" id="addr-info-close">&times;</button>';
    this._div.innerHTML = closeBtn + html;
    this._div.style.display = 'block';
    this._div.querySelector('#addr-info-close').addEventListener('click', function () {
        self.reset();
    });
};
addressInfoControl.addTo(map);

function setBoundaryMemberVisibility(boundaryMember, isVisible) {
    if (!boundaryMember) return;
    if (isVisible) {
        boundaryMember.layer.addTo(map);
    } else {
        map.removeLayer(boundaryMember.layer);
    }
    if (boundaryMember.checkbox) boundaryMember.checkbox.checked = isVisible;
    if (boundaryMember.syncStageCheckbox) boundaryMember.syncStageCheckbox();
}

function clearAutoActivatedBoundaries() {
    activeAddressBoundaryIds.forEach(function (id) {
        const boundaryMember = boundaryById[id];
        if (boundaryMember && map.hasLayer(boundaryMember.layer)) {
            setBoundaryMemberVisibility(boundaryMember, false);
        }
    });
    activeAddressBoundaryIds = [];
}

// ===== Spatial lookup + address rendering =====
function findContainingBoundaries(latlng) {
    const pt = turf.point([latlng.lng, latlng.lat]);
    return schoolBoundaryFeatures.filter(function (feature) {
        try {
            return turf.booleanPointInPolygon(pt, feature);
        } catch (e) {
            return false;
        }
    }).map(function (feature) {
        const props = feature.properties || {};
        return {
            stage: props.stage || 'Other',
            label: (props.stage || '?') + ': ' + (props.schoolname || 'Unknown'),
            schoolid: String(props.schoolid)
        };
    });
}

function findContainingDistrict(latlng) {
    const pt = turf.point([latlng.lng, latlng.lat]);
    for (let i = 0; i < districtFeatures.length; i += 1) {
        const feature = districtFeatures[i];
        try {
            if (turf.booleanPointInPolygon(pt, feature)) {
                const props = feature.properties || {};
                return props.DISTRICT ? (props.DISTRICT + ' School District') : 'School District';
            }
        } catch (e) {
            // ignore invalid geometry and continue
        }
    }
    return null;
}

function drawLinesToSchools(fromLatlng, matches) {
    clearAutoActivatedBoundaries();

    activeAddressGroup.clearLayers();
    matches.forEach(function (match) {
        const pt = schoolPointsById[match.schoolid];
        if (pt) {
            L.polyline([fromLatlng, pt.latlng], {
                color: pt.color,
                weight: 2,
                dashArray: '6 4',
                opacity: 0.8
            }).addTo(activeAddressGroup);
        }

        // Turn on the matching boundary layer and sync sidebar checkbox
        const boundaryMember = boundaryById[match.schoolid];
        if (boundaryMember && !map.hasLayer(boundaryMember.layer)) {
            setBoundaryMemberVisibility(boundaryMember, true);
            activeAddressBoundaryIds.push(match.schoolid);
        }
    });
    activeAddressGroup.addTo(map);
}

function formatAddressObj(addr, fallback) {
    const parts = [
        [addr.house_number, addr.road].filter(Boolean).join(' '),
        addr.city || addr.town || addr.village || addr.hamlet || ''
    ].filter(Boolean);
    return parts.length > 0 ? parts.join('<br>') : (fallback || '');
}

function formatGeocodeName(geocode) {
    const addr = (geocode.properties && geocode.properties.address) || {};
    return formatAddressObj(addr, geocode.name);
}

function buildAddressInfo(label, latlng) {
    const matches = findContainingBoundaries(latlng).sort(function (a, b) {
        return compareStages(a.stage, b.stage);
    });
    let html = '<strong>' + label + '</strong>';
    if (matches.length > 0) {
        html += '<br><br><strong>School Boundaries</strong><br>' +
            matches.map(function (m) { return m.label; }).join('<br>');
    } else {
        const districtName = findContainingDistrict(latlng);
        if (districtName) {
            html += '<br><br><strong>District</strong><br>' + districtName;
        } else {
            html += '<br><em>Not within any school boundary</em>';
        }
    }
    drawLinesToSchools(latlng, matches);
    L.marker(latlng).addTo(activeAddressGroup);
    addressInfoControl.update(html);
}

// ===== Base map + geocoding interactions =====
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

// Add the Search Bar (Wisconsin only)
var geocoder = L.Control.geocoder({
    defaultMarkGeocode: false,
    collapsed: false,
    geocoder: L.Control.Geocoder.nominatim({
        geocodingQueryParams: {
            countrycodes: 'us',
            viewbox: WI_VIEWBOX, // WI bbox: west,north,east,south
            bounded: 1
        }
    })
})
    .on('markgeocode', function (e) {
        const latlng = e.geocode.center;
        map.setView(latlng, SEARCH_ZOOM);
        buildAddressInfo(formatGeocodeName(e.geocode), latlng);
    })
    .addTo(map);

// Right-click to reverse geocode
map.on('contextmenu', function (e) {
    const latlng = e.latlng;
    addressInfoControl.update('<em>Looking up address…</em>');
    const url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' +
        latlng.lat + '&lon=' + latlng.lng;

    fetch(url)
        .then(function (response) { return response.json(); })
        .then(function (data) {
            const label = formatAddressObj(data.address || {}, data.display_name || 'Unknown location');
            buildAddressInfo(label, latlng);
        })
        .catch(function () {
            activeAddressGroup.clearLayers();
            addressInfoControl.update('<em>Could not retrieve address</em>');
        });
});

function fetchJson(path) {
    return fetch(path).then(function (response) {
        if (!response.ok) {
            throw new Error('Failed to load ' + path + ': ' + response.status);
        }
        return response.json();
    });
}

function fetchYaml(path) {
    return fetch(path)
        .then(function (response) {
            if (!response.ok) {
                throw new Error('Failed to load ' + path + ': ' + response.status);
            }
            return response.text();
        })
        .then(function (yaml) {
            return jsyaml.load(yaml);
        });
}

// ===== District layer =====
function districtStyle(feature) {
    const districtName = feature.properties.DISTRICT;
    const isSunPrairie = districtName && districtName.toLowerCase().includes('sun prairie');

    if (isSunPrairie) {
        return {
            color: '#000000',
            weight: 3,
            fillColor: null,
            fillOpacity: 0
        };
    }

    return {
        color: '#000000',
        weight: 0.5,
        fillColor: '#000000',
        fillOpacity: 0.1
    };
}

function DistrictPopup(feature, layer) {
    const name = feature.properties.DISTRICT + ' School District';
    layer.bindPopup('<strong>' + name + '</strong>');
}

// ===== School points layer =====
function getSchoolColors(config) {
    const schools = (config && config.school) || [];
    return schools.reduce(function (colorMap, school) {
        colorMap[String(school.schoolid)] = school.primaryColor;
        return colorMap;
    }, {});
}

function schoolPointToLayer(schoolColors) {
    return function (feature, latlng) {
        const props = feature.properties || {};
        const color = props.primarycolor || schoolColors[String(props.schoolid)] || DEFAULT_POINT_COLOR;

        return L.circleMarker(latlng, {
            radius: 8,
            color: '#ffffff',
            weight: 1.5,
            fillColor: color,
            fillOpacity: 0.95
        });
    };
}

function makeSchoolPointOnEachFeature(boundaryById, getPointsLayer) {
    return function (feature, layer) {
        const props = feature.properties || {};
        const name = props.schoolname || 'School';
        const stage = props.stage || '';
        const address = props.address || 'N/A';

        layer.bindPopup(
            '<strong>' + name + '</strong><br>' +
            (stage ? stage + '<br>' : '') +
            'Address: ' + address
        );

        layer.on('click', function () {
            const id = String(props.schoolid);
            const boundaryMember = boundaryById[id];
            if (!boundaryMember) return;

            setBoundaryMemberVisibility(boundaryMember, !map.hasLayer(boundaryMember.layer));

            const pl = getPointsLayer();
            if (pl) pl.bringToFront();
        });
    };
}

// ===== School boundary layers + hierarchy control =====
function schoolBoundaryStyle(schoolColors) {
    return function (feature) {
        const props = feature.properties || {};
        const color = schoolColors[String(props.schoolid)] || '#666666';

        return {
            color: color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.2
        };
    };
}

function SchoolBoundaryPopup(feature, layer) {
    const props = feature.properties || {};
    const name = props.schoolname || 'School Boundary';

    layer.bindPopup(
        '<strong>' + name + '</strong><br>'
    );
}

function buildBoundaryStageGroups(boundaryData, schoolColors) {
    const groups = {};
    const boundaryStyle = schoolBoundaryStyle(schoolColors);

    boundaryData.features.forEach(function (feature) {
        const props = feature.properties || {};
        const stage = props.stage || 'Other';
        const schoolName = props.schoolname || 'Unknown School';
        const visible = Boolean(props.visibility);

        const layer = L.geoJSON(feature, {
            style: boundaryStyle,
            onEachFeature: SchoolBoundaryPopup
        });

        if (visible) {
            layer.addTo(map);
        }

        if (!groups[stage]) {
            groups[stage] = [];
        }

        groups[stage].push({
            name: schoolName,
            schoolid: String(props.schoolid),
            layer: layer,
            visible: visible,
            checkbox: null,
            syncStageCheckbox: null
        });
    });

    Object.keys(groups).forEach(function (stage) {
        groups[stage].sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
    });

    const bySchoolId = {};
    Object.keys(groups).forEach(function (stage) {
        groups[stage].forEach(function (member) {
            bySchoolId[member.schoolid] = member;
        });
    });

    return { groups, bySchoolId };
}

function createBoundaryHierarchyControl(stageGroups) {
    const BoundaryHierarchyControl = L.Control.extend({
        options: {
            position: 'topright'
        },
        onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-control');
            container.style.background = '#ffffff';
            container.style.padding = '10px';
            container.style.border = '1px solid #bbb';
            container.style.borderRadius = '4px';
            container.style.maxHeight = '600px';
            container.style.overflowY = 'auto';
            container.style.minWidth = '170px'; // was 230px

            const title = document.createElement('div');
            title.innerHTML = '<strong>School Boundaries</strong>';
            title.style.marginBottom = '8px';
            container.appendChild(title);

            Object.keys(stageGroups).sort(compareStages).forEach(function (stage) {
                const members = stageGroups[stage];
                const stageRow = document.createElement('div');
                stageRow.style.marginBottom = '6px';

                const stageLabel = document.createElement('label');
                stageLabel.style.display = 'block';
                stageLabel.style.fontWeight = 'bold';

                const stageCheckbox = document.createElement('input');
                stageCheckbox.type = 'checkbox';
                stageCheckbox.style.marginRight = '6px';

                stageLabel.appendChild(stageCheckbox);
                stageLabel.appendChild(document.createTextNode(stage));
                stageRow.appendChild(stageLabel);

                const membersContainer = document.createElement('div');
                membersContainer.style.marginLeft = '18px';

                const memberItems = members.map(function (member) {
                    const memberLabel = document.createElement('label');
                    memberLabel.style.display = 'block';
                    memberLabel.style.fontWeight = 'normal';

                    const memberCheckbox = document.createElement('input');
                    memberCheckbox.type = 'checkbox';
                    memberCheckbox.checked = map.hasLayer(member.layer);
                    memberCheckbox.style.marginRight = '6px';

                    member.checkbox = memberCheckbox;

                    memberCheckbox.addEventListener('change', function () {
                        setBoundaryMemberVisibility(member, memberCheckbox.checked);
                    });

                    memberLabel.appendChild(memberCheckbox);
                    memberLabel.appendChild(document.createTextNode(member.name));
                    membersContainer.appendChild(memberLabel);

                    return {
                        member: member,
                        checkbox: memberCheckbox
                    };
                });

                function updateStageCheckbox() {
                    const checkedCount = memberItems.filter(function (item) {
                        return item.checkbox.checked;
                    }).length;

                    stageCheckbox.checked = checkedCount === memberItems.length;
                    stageCheckbox.indeterminate = checkedCount > 0 && checkedCount < memberItems.length;
                }

                members.forEach(function (member) {
                    member.syncStageCheckbox = updateStageCheckbox;
                });

                stageCheckbox.addEventListener('change', function () {
                    memberItems.forEach(function (item) {
                        item.checkbox.checked = stageCheckbox.checked;
                        setBoundaryMemberVisibility(item.member, stageCheckbox.checked);
                    });
                    stageCheckbox.indeterminate = false;
                });

                updateStageCheckbox();
                stageRow.appendChild(membersContainer);
                container.appendChild(stageRow);
            });

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            return container;
        }
    });

    return new BoundaryHierarchyControl();
}

// ===== Data loading + final map wiring =====
async function loadMapData() {
    try {
        const districtData = await fetchJson('districts.geojson');
        const schoolPointsData = await fetchJson('schoolPoints.geojson');
        const schoolBoundaryData = await fetchJson('schoolBoundary.geojson');
        const config = await fetchYaml('schools_config.yaml');
        const schoolColors = getSchoolColors(config);

        const overlays = {};

        const districtLayer = L.geoJSON(districtData, {
            style: districtStyle,
            onEachFeature: DistrictPopup
        }).addTo(map);

        districtFeatures = districtData.features || [];

        // Build boundary groups first so the lookup is ready for point click handlers
        // Store boundary features for geocoder point-in-polygon lookups
        schoolBoundaryFeatures = schoolBoundaryData.features || [];

        // Build schoolid -> { latlng, color } lookup for line drawing
        schoolPointsData.features.forEach(function (feature) {
            const props = feature.properties || {};
            const id = String(props.schoolid);
            const coords = feature.geometry && feature.geometry.coordinates;
            if (!coords) return;
            schoolPointsById[id] = {
                latlng: L.latLng(coords[1], coords[0]),
                color: props.primarycolor || schoolColors[id] || DEFAULT_POINT_COLOR
            };
        });

        const { groups: boundaryStageGroups, bySchoolId: _boundaryById } = buildBoundaryStageGroups(schoolBoundaryData, schoolColors);
        boundaryById = _boundaryById;

        // Add hierarchy control first so member.checkbox refs get populated
        createBoundaryHierarchyControl(boundaryStageGroups).addTo(map);

        let schoolPointsLayer;
        schoolPointsLayer = L.geoJSON(schoolPointsData, {
            pointToLayer: schoolPointToLayer(schoolColors),
            onEachFeature: makeSchoolPointOnEachFeature(boundaryById, function () { return schoolPointsLayer; })
        }).addTo(map);

        // Keep school points on top whenever any layer is added to the map
        map.on('layeradd', function () {
            if (schoolPointsLayer) schoolPointsLayer.bringToFront();
        });

        overlays['Districts'] = districtLayer;
        overlays['Schools'] = schoolPointsLayer;

        L.control.layers(null, overlays, { collapsed: false, position: 'topleft' }).addTo(map);
    } catch (error) {
        console.error('Unable to load map data:', error);
    }
}

loadMapData();
