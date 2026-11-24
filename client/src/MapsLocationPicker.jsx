import { useEffect, useRef, useState } from "react";
import "./MapsLocationPicker.css";

const CAMPUS_CENTER = { lat: 37.3496, lng: -121.9390 };

let mapsApiPromise;

function loadGoogleMaps(apiKey) {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (mapsApiPromise) return mapsApiPromise;

  mapsApiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async`;
    script.async = true;
    script.onerror = () => reject(new Error("Google Maps could not load. Check the API key and enabled Maps APIs."));
    script.onload = () => {
      if (window.google?.maps?.importLibrary) resolve(window.google.maps);
      else reject(new Error("Google Maps did not start. Check the API key and Maps JavaScript API access."));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    mapsApiPromise = null;
    throw error;
  });

  return mapsApiPromise;
}

function asPoint(value) {
  if (!value) return null;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function formatDistance(meters) {
  const miles = meters / 1609.344;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

function MapsLocationPicker({
  apiKey,
  origin,
  destination,
  originCoordinates,
  destinationCoordinates,
  onLocationChange,
  onDistanceChange,
}) {
  const mapElement = useRef(null);
  const originSearchElement = useRef(null);
  const destinationSearchElement = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({ origin: null, destination: null });
  const polylinesRef = useRef([]);
  const activeFieldRef = useRef("origin");
  const onLocationChangeRef = useRef(onLocationChange);
  const onDistanceChangeRef = useRef(onDistanceChange);
  const locationRef = useRef({ origin, destination, originCoordinates, destinationCoordinates });
  const [activeField, setActiveField] = useState("origin");
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");
  const [distance, setDistance] = useState(null);

  onLocationChangeRef.current = onLocationChange;
  onDistanceChangeRef.current = onDistanceChange;
  locationRef.current = { origin, destination, originCoordinates, destinationCoordinates };

  function chooseField(field) {
    activeFieldRef.current = field;
    setActiveField(field);
  }

  useEffect(() => {
    if (!apiKey) {
      setStatus("Add VITE_GOOGLE_MAPS_API_KEY to client/.env.local to enable the interactive map.");
      return undefined;
    }

    let disposed = false;
    let reverseGeocoder;

    async function updateAddressFromPoint(field, point) {
      if (!reverseGeocoder) return;
      try {
        const { results } = await reverseGeocoder.geocode({ location: point });
        const address = results?.[0]?.formatted_address;
        if (!address) throw new Error("Google Maps could not find a street address for that pin.");
        onLocationChangeRef.current(field, address, point);
        setStatus(`${field === "origin" ? "Pickup" : "Destination"} pin set.`);
      } catch (error) {
        setStatus(error.message || "Could not look up an address for that pin.");
      }
    }

    async function initMap() {
      try {
        const maps = await loadGoogleMaps(apiKey);
        const [{ Map }, { AdvancedMarkerElement }, { PlaceAutocompleteElement }] = await Promise.all([
          maps.importLibrary("maps"),
          maps.importLibrary("marker"),
          maps.importLibrary("places"),
        ]);
        if (disposed || !mapElement.current) return;

        const map = new Map(mapElement.current, {
          center: CAMPUS_CENTER,
          zoom: 12,
          mapId: "DEMO_MAP_ID",
          mapTypeControl: false,
          streetViewControl: false,
          clickableIcons: false,
          fullscreenControl: true,
        });
        mapRef.current = map;
        reverseGeocoder = new maps.Geocoder();

        markersRef.current.origin = new AdvancedMarkerElement({
          map: null,
          title: "Pickup spot",
          gmpDraggable: true,
        });
        markersRef.current.destination = new AdvancedMarkerElement({
          map: null,
          title: "Destination",
          gmpDraggable: true,
        });

        for (const field of ["origin", "destination"]) {
          markersRef.current[field].addListener("dragend", (event) => {
            const markerPosition = markersRef.current[field].position;
            const point = asPoint(event.latLng?.toJSON?.() || event.latLng || markerPosition?.toJSON?.() || markerPosition);
            if (point) {
              chooseField(field);
              void updateAddressFromPoint(field, point);
            }
          });
        }

        map.addListener("click", (event) => {
          const point = asPoint(event.latLng?.toJSON?.() || event.latLng);
          const field = activeFieldRef.current;
          if (point) {
            markersRef.current[field].position = point;
            markersRef.current[field].map = map;
            void updateAddressFromPoint(field, point);
          }
        });

        for (const [field, host, placeholder] of [
          ["origin", originSearchElement.current, "Search for a pickup address"],
          ["destination", destinationSearchElement.current, "Search for a destination"],
        ]) {
          if (!host) continue;
          const autocomplete = new PlaceAutocompleteElement({ placeholder, includedRegionCodes: ["us"] });
          autocomplete.className = "maps-autocomplete";
          autocomplete.addEventListener("input", () => {
            onLocationChangeRef.current(field, "", null);
            onDistanceChangeRef.current(null);
          });
          autocomplete.addEventListener("gmp-select", async ({ placePrediction }) => {
            try {
              const place = placePrediction.toPlace();
              await place.fetchFields({ fields: ["id", "formattedAddress", "location", "viewport"] });
              const point = asPoint(place.location?.toJSON?.() || place.location);
              if (!point || !place.formattedAddress) {
                throw new Error("Choose a full address from the suggestions.");
              }
              chooseField(field);
              onLocationChangeRef.current(field, place.formattedAddress, point);
              markersRef.current[field].position = point;
              markersRef.current[field].map = map;
              if (place.viewport) map.fitBounds(place.viewport);
              else {
                map.setCenter(point);
                map.setZoom(16);
              }
              setStatus(`${field === "origin" ? "Pickup" : "Destination"} selected. Drag its pin to fine-tune the spot.`);
            } catch (error) {
              setStatus(error.message || "Could not use that address. Try another result.");
            }
          });
          host.replaceChildren(autocomplete);
        }

        setReady(true);
        setStatus("Search for both locations, or click the map to place the selected pin.");
      } catch (error) {
        if (!disposed) setStatus(error.message || "Google Maps could not be initialized.");
      }
    }

    void initMap();
    return () => {
      disposed = true;
      for (const polyline of polylinesRef.current) polyline.setMap(null);
      polylinesRef.current = [];
      mapRef.current = null;
      markersRef.current = { origin: null, destination: null };
    };
  }, [apiKey]);

  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return;
    const { originCoordinates, destinationCoordinates } = locationRef.current;
    const originPoint = asPoint(originCoordinates);
    const destinationPoint = asPoint(destinationCoordinates);
    const map = mapRef.current;

    for (const [field, point] of [["origin", originPoint], ["destination", destinationPoint]]) {
      const marker = markersRef.current[field];
      if (!marker) continue;
      marker.position = point;
      marker.map = point ? map : null;
    }

    let cancelled = false;
    async function drawRoute() {
      for (const polyline of polylinesRef.current) polyline.setMap(null);
      polylinesRef.current = [];
      setDistance(null);
      onDistanceChangeRef.current(null);
      if (!originPoint || !destinationPoint) return;

      try {
        setStatus("Calculating driving distance…");
        const { Route } = await window.google.maps.importLibrary("routes");
        const { routes } = await Route.computeRoutes({
          origin: originPoint,
          destination: destinationPoint,
          travelMode: "DRIVING",
          routingPreference: "TRAFFIC_UNAWARE",
          fields: ["path", "distanceMeters", "durationMillis"],
        });
        if (cancelled) return;
        const route = routes?.[0];
        if (!route) throw new Error("No driving route was found for those locations.");
        polylinesRef.current = route.createPolylines();
        polylinesRef.current.forEach((polyline) => polyline.setMap(map));
        if (route.path?.length) {
          const bounds = new window.google.maps.LatLngBounds();
          route.path.forEach((point) => bounds.extend(point));
          map.fitBounds(bounds, 48);
        }
        const routeInfo = { meters: route.distanceMeters, durationMillis: route.durationMillis };
        setDistance(routeInfo);
        onDistanceChangeRef.current(routeInfo);
        setStatus("Route ready. You can drag either pin or click the map to adjust it.");
      } catch (error) {
        if (!cancelled) setStatus(error.message || "Could not calculate a driving route.");
      }
    }

    void drawRoute();
    return () => { cancelled = true; };
  }, [ready, originCoordinates?.lat, originCoordinates?.lng, destinationCoordinates?.lat, destinationCoordinates?.lng]);

  return (
    <section className="location-picker" aria-label="Choose ride locations on a map">
      <div className="location-picker-searches">
        <div className="location-search-field">
          <span className="location-search-label">PICKUP ADDRESS</span>
          <div ref={originSearchElement} className="maps-autocomplete-host" />
          {origin && <p className="selected-address">{origin}</p>}
        </div>
        <div className="location-search-field">
          <span className="location-search-label">DESTINATION ADDRESS</span>
          <div ref={destinationSearchElement} className="maps-autocomplete-host" />
          {destination && <p className="selected-address">{destination}</p>}
        </div>
      </div>
      <div className="map-point-controls" role="group" aria-label="Choose which location to place">
        <span>Click map to place:</span>
        <button type="button" className={activeField === "origin" ? "active" : ""} onClick={() => chooseField("origin")}>Pickup pin</button>
        <button type="button" className={activeField === "destination" ? "active" : ""} onClick={() => chooseField("destination")}>Destination pin</button>
      </div>
      <div ref={mapElement} className="ride-map" role="application" aria-label="Interactive pickup and destination map" />
      <p className="map-status" role="status">{status}</p>
      {distance && <div className="route-distance" aria-live="polite">
        <strong>{formatDistance(distance.meters)}</strong>
        <span>driving distance</span>
        {Number.isFinite(distance.durationMillis) && <span>· about {Math.max(1, Math.round(distance.durationMillis / 60000))} min</span>}
      </div>}
    </section>
  );
}

export default MapsLocationPicker;
