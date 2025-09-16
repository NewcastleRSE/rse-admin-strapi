const request = require('supertest')

module.exports = function(JWT) {

describe("Facilities API", () => {
  let facility;

  console.log(JWT)

  it("should create a new facility", async () => {
    const res = await request(strapi.server.httpServer)
      .post("api/facilities?pagination[page]=0&pagination[pageSize]=100")
      .set('Authorization', `Bearer ${JWT}`)
      .send({
        data: {
          year: 2025,
          nonSalaryCosts: 100000,
          estatesCosts: 50000,
          dayRate: 450,
          utilisationRate: 75,
          incomeTarget: 1000000
        }
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toHaveProperty("id");
    expect(res.body.data.attributes.year).toBe(2025);
    facility = res.body.data;
  });
/*
  it("should fetch all facilities", async () => {
    const res = await request(app).get("/api/facilities");
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("should fetch a single facility", async () => {
    const res = await request(app).get(`/api/facilities/${facility.id}`);
    expect(res.statusCode).toEqual(200);
    expect(res.body.data.id).toBe(facility.id);
  });

  it("should update a facility", async () => {
    const res = await request(app)
      .put(`/api/facilities/${facility.id}`)
      .send({
        data: {
          name: "Updated Test Facility"
        }
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body.data.attributes.name).toBe("Updated Test Facility");
  });

  it("should delete a facility", async () => {
    const res = await request(app).delete(`/api/facilities/${facility.id}`);
    expect(res.statusCode).toEqual(200);

    const fetchRes = await request(app).get(`/api/facilities/${facility.id}`);
    expect(fetchRes.statusCode).toEqual(404);
  });*/
});
}