// import cron from "node-cron";
// import { deleteLocationFolder, readLocations, writeLocations } from "../utils/locationUtils";

// const cleanupExpiredReservations = () => {
//   const locations = readLocations();
//   const now = new Date();

//   locations.forEach((location) => {
//     if (location.reservation && new Date(location.reservation.endDate) < now) {
//       // Expired reservation
//       console.log(`Cleaning up expired reservation for location ${location.id}`);
//       location.reservation = null;
//       deleteLocationFolder(location.id);
//     }
//   });

//   writeLocations(locations);
// };

// // Schedule the cleanup job to run at midnight every day
// cron.schedule("0 0 * * *", () => {
//   console.log("Running cleanup job...");
//   cleanupExpiredReservations();
// });

// export default cleanupExpiredReservations;
