# boundarymap

Interactive school boundary map built with Leaflet.

## Live Demo

GitHub Pages: https://braskie.github.io/boundarymap/

## What This Project Does

- Displays school district boundaries from GeoJSON.
- Loads school features (points + polygons) and groups them by stage.
- Uses `schools_config.yaml` to apply school colors.
- Lets you click school points to toggle matching school polygons.
- Includes address search (Nominatim via Leaflet Control Geocoder), scoped to Wisconsin.
- Provides layer controls to show/hide district + stage groups.

## Tech Stack

- [Leaflet](https://leafletjs.com/)
- [Leaflet Control Geocoder](https://github.com/perliedman/leaflet-control-geocoder)
- [Turf.js](https://turfjs.org/)
- Plain HTML/CSS/JavaScript (no build step)

## Project Structure

- `map.html` — app shell + external library includes
- `map.js` — map logic, layers, interactions
- `districts.geojson` — district boundaries
- `schools.geojson` — school points/polygons
- `schools_config.yaml` — school metadata/colors
