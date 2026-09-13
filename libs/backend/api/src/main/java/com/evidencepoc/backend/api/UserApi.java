package com.evidencepoc.backend.api;

import com.evidencepoc.backend.api.representation.UserModel;
import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.domain.model.Users;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;

@Produces({"application/prs.hal-forms+json", "application/hal+json", "application/json"})
public class UserApi {
  private final User user;
  private final Users users;

  public UserApi(User user, Users users) {
    this.user = user;
    this.users = users;
  }

  @GET
  public UserModel get(@Context UriInfo uriInfo) {
    return new UserModel(user, uriInfo);
  }

  @PUT
  @Consumes("application/json")
  public UserModel update(UserRequest input, @Context UriInfo uriInfo) {
    return new UserModel(users.update(user.getIdentity(), UserRequest.description(input)), uriInfo);
  }

  @DELETE
  public Response delete() {
    users.delete(user.getIdentity());
    return Response.noContent().build();
  }
}
