package com.evidencepoc.backend.api;

import com.evidencepoc.backend.api.representation.UserModel;
import com.evidencepoc.backend.domain.UserNotFoundException;
import com.evidencepoc.backend.domain.model.User;
import com.evidencepoc.backend.domain.model.Users;
import io.github.jayclock.smartdomain.api.hateoas.pagination.Pagination;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.CollectionModel;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;

@Produces({"application/prs.hal-forms+json", "application/hal+json", "application/json"})
public class UsersApi {
  private final Users users;
  @Context private ResourceContext resourceContext;

  public UsersApi(Users users) {
    this.users = users;
  }

  @GET
  public CollectionModel<UserModel> list(
      @QueryParam("page") String pageInput,
      @QueryParam("size") String sizeInput,
      @Context UriInfo uriInfo) {
    int page = queryNumber(pageInput, 0);
    int size = queryNumber(sizeInput, 20);
    if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE - size) {
      throw new BadRequestException("Invalid page or size");
    }
    var result =
        new Pagination<>(users.findAll(), size)
            .page(
                page,
                user -> new UserModel(user, uriInfo),
                number -> ApiTemplates.usersPage(uriInfo, number, size));
    return result.add(
        Affordances.of(Link.of(ApiTemplates.relative(ApiTemplates.users(uriInfo)), "create"))
            .afford(HttpMethod.POST)
            .withInput(UserRequest.class)
            .withInputMediaType(MediaType.APPLICATION_JSON)
            .withName("create")
            .toLink());
  }

  private static int queryNumber(String input, int defaultValue) {
    try {
      return input == null ? defaultValue : Integer.parseInt(input);
    } catch (NumberFormatException exception) {
      throw new BadRequestException("Page and size must be integers");
    }
  }

  @POST
  @Consumes("application/json")
  public Response create(UserRequest input, @Context UriInfo uriInfo) {
    User created = users.create(UserRequest.description(input));
    return Response.status(Response.Status.CREATED)
        .header(
            "Location", ApiTemplates.relative(ApiTemplates.user(uriInfo, created.getIdentity())))
        .entity(new UserModel(created, uriInfo))
        .build();
  }

  @Path("{userId}")
  public UserApi findById(@PathParam("userId") String userId) {
    User user = users.findByIdentity(userId).orElseThrow(UserNotFoundException::new);
    return resourceContext.initResource(new UserApi(user, users));
  }
}
