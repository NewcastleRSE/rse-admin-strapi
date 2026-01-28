import { DateTime, Interval } from 'luxon'
import axios from 'axios'
import { setupCache } from 'axios-cache-interceptor'


const api = setupCache(axios.create(), {
  methods: ['get']
})

const clockifyConfig = {
  baseURL: `https://reports.api.clockify.me/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}/reports`,
  headers: {
    'X-Api-Key': process.env.CLOCKIFY_KEY,
  },
  cache: {
    maxAge: 60 * 60 * 1000
  }
}

const bankHolidaysConfig = {
  baseURL: 'https://www.gov.uk',
  cache: {
    maxAge: 24 * 60 * 60 * 1000
  }
}

const leaveConfig = {
  baseURL: 'https://sageapps.ncl.ac.uk/public/',
  headers: {
    Authorization: `Bearer ${process.env.LEAVE_API_TOKEN}`
  },
  cache: {
    maxAge: 60 * 60 * 1000
  }
}


/**
 * Calculates the total number of inclusive leave days for a specific person.
 * @param {string} username - The ID/Username of the RSE.
 * @param {DateTime} userStart - Luxon DateTime for the start of the range.
 * @param {DateTime} userEnd - Luxon DateTime for the end of the range.
 * @returns {Promise<number>} - Total count of booked leave days.
 */
export const getLeaveCountForRSE = async (username, userStart, userEnd) => {
  // Create an interval for the inclusive period
  const period = Interval.fromDateTimes(userStart.startOf('day'), userEnd.endOf('day'));

  try {
    // Determine which financial years need to be queried based on the input range
    // Using the logic from the original snippet to fetch current and previous year data
    const [response1, response2] = await Promise.all([
      api.get(`/turner?YEAR=${userStart.year}-${userStart.year + 1}`, leaveConfig),
      api.get(`/turner?YEAR=${userStart.year - 1}-${userStart.year}`, leaveConfig)
    ]);

    const combinedData = [...response1.data, ...response2.data];
    

    // Filter data based on date range, status, and specific username
    const bookedDays = combinedData.filter(leave => {
      const leaveDate = DateTime.fromISO(leave.DATE);
      
      return (
        leave.ID === username &&              // Matches the specific RSE
        leave.STATUS !== '3' &&                // Excludes cancelled leave
        period.contains(leaveDate)             // Within the user-defined dates
      );
    });

    // Count days based on full or half-day leave
    let count = 0
    bookedDays.forEach(leave => {
      count += leave.DURATION === 'Y' ? 1 : 0.5;
    });

    // Return the total count of days found
    return count;

  } catch (ex) {
    console.error(`Error fetching leave for ${username}: ${ex.message}`);
    return 0;
  }
}

/**
 * Fetches bank holidays and calculates university closures, 
 * returning only the total count of these days within the range.
 * @param {DateTime} startDate - Luxon DateTime for the start of the range.
 * @param {DateTime} endDate - Luxon DateTime for the end of the range.
 * @returns {Promise<number>} - The total count of closure days.
 */
export const countTotalClosures = async (startDate, endDate) => {
  const response = await api.get('/bank-holidays.json', bankHolidaysConfig);
  
  // 1. Filter Bank Holidays strictly within the range
  const bankHolidaysInRange = response.data['england-and-wales'].events.filter(holiday => {
    const holidayDate = DateTime.fromISO(holiday.date);
    return holidayDate >= startDate && holidayDate <= endDate;
  });

  let closureCount = 0;

  // 2. Calculate University Closures within the range
  // Iterate through each year spanned by the range
  for (let year = startDate.year; year <= endDate.year; year++) {
    const christmasEve = DateTime.fromISO(`${year}-12-24`);
    
    // Check the standard 8-day closure block
    for (let i = 0; i <= 7; i++) {
      let closureDate = christmasEve.plus({ days: i });
      
      if (closureDate >= startDate && closureDate <= endDate) {
        // Only count if it isn't already a bank holiday to avoid double counting
        const isBankHoliday = bankHolidaysInRange.some(bh => bh.date === closureDate.toISODate());
        if (!isBankHoliday) {
          closureCount++;
        }
      }
    }

    // Check special "Tuesday Christmas Eve" rule
    if (christmasEve.weekday === 2) {
      const extraClosure = christmasEve.minus({ days: 1 });
      if (extraClosure >= startDate && extraClosure <= endDate) {
        closureCount++;
      }
    }
  }

  // Return the sum of filtered bank holidays and calculated closures
  return bankHolidaysInRange.length + closureCount;
}